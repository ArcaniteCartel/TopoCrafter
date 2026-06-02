import { useCallback, useEffect, useRef, useState } from 'react'
import { Center, Text, Stack, Loader, Overlay } from '@mantine/core'
import type { ContourMultiPolygon } from 'd3-contour'
import { useStore } from '../../store/useStore'
import { generateContours, contourToSvgPath } from '../../utils/contour'
import type { ContourSet } from '../../utils/contour'
import type { ElevationFlag, SlopeArrow, FrameConfig } from '../../types'

function getLabelPoint(poly: ContourMultiPolygon): [number, number] | null {
  let best: [number, number][] | null = null
  for (const polygon of poly.coordinates) {
    for (const ring of polygon) {
      if (!best || ring.length > best.length) best = ring as [number, number][]
    }
  }
  if (!best || best.length === 0) return null
  return best[Math.floor(best.length / 2)]
}

// Snapshot of calibration values captured at recalculate time so labels stay
// in sync with the contour lines they annotate, not live parameter edits.
interface ContourState {
  contourSet: ContourSet
  realMin: number | null
  realMax: number | null
  realInterval: number | null
  minElevation: number
  maxElevation: number
}

type SelectedItem = { type: 'flag' | 'slope-arrow'; id: string }
type DragRef = { type: 'flag' | 'slope-arrow'; itemId: string; startX: number; startY: number; moved: boolean }
type DragPos = { x: number; y: number; elevation?: number; angleDeg?: number; slopeDeg?: number }

function FrameBorderOverlay({ frame }: { frame: FrameConfig }): JSX.Element {
  const { borderStyle, borderColor, borderWidth: bw } = frame
  const base: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
  }

  if (borderStyle === 'single') {
    return <div style={{ ...base, border: `${bw}px solid ${borderColor}` }} />
  }

  if (borderStyle === 'double') {
    const gap = Math.round(bw * 1.5)
    return (
      <div style={{
        ...base,
        border: `${bw}px solid ${borderColor}`,
        outline: `${bw}px solid ${borderColor}`,
        outlineOffset: `-${bw + gap + bw}px`,
      }} />
    )
  }

  if (borderStyle === 'cartographic') {
    // Outer solid + inner dashed
    const gap = Math.round(bw * 2)
    const innerInset = bw + gap
    const innerBw = Math.max(1, Math.round(bw * 0.6))
    return (
      <>
        <div style={{ ...base, border: `${bw}px solid ${borderColor}` }} />
        <div style={{ ...base, inset: innerInset, border: `${innerBw}px dashed ${borderColor}` }} />
      </>
    )
  }

  if (borderStyle === 'shadow') {
    return (
      <div style={{
        ...base,
        border: `${bw}px solid ${borderColor}`,
        boxShadow: `${bw * 1.5}px ${bw * 1.5}px ${bw * 2}px rgba(0,0,0,0.45)`,
      }} />
    )
  }

  // ornate — double line with corner accent squares
  if (borderStyle === 'ornate') {
    const gap = Math.round(bw * 1.5)
    const innerInset = bw + gap
    const cornerSize = bw * 3
    const cornerStyle: React.CSSProperties = {
      position: 'absolute',
      width: cornerSize,
      height: cornerSize,
      background: borderColor,
      pointerEvents: 'none',
    }
    return (
      <>
        <div style={{ ...base, border: `${bw}px solid ${borderColor}` }} />
        <div style={{ ...base, inset: innerInset, border: `${bw}px solid ${borderColor}` }} />
        {/* Corner accent squares at inner border corners */}
        <div style={{ ...cornerStyle, top: innerInset - bw / 2, left: innerInset - bw / 2 }} />
        <div style={{ ...cornerStyle, top: innerInset - bw / 2, right: innerInset - bw / 2 }} />
        <div style={{ ...cornerStyle, bottom: innerInset - bw / 2, left: innerInset - bw / 2 }} />
        <div style={{ ...cornerStyle, bottom: innerInset - bw / 2, right: innerInset - bw / 2 }} />
      </>
    )
  }

  return <></>
}

export function MapCanvas(): JSX.Element {
  const terrainImageUrl = useStore((s) => s.terrainImageUrl)
  const hillshadeImageUrl = useStore((s) => s.hillshadeImageUrl)
  const activeTab = useStore((s) => s.activeTab)
  const heightmap = useStore((s) => s.heightmap)
  const parameters = useStore((s) => s.parameters)
  const style = useStore((s) => s.style)
  const hillshadeGenerating = useStore((s) => s.hillshadeGenerating)
  const fileLoadingMessage = useStore((s) => s.fileLoadingMessage)
  const elevationCalibration = useStore((s) => s.elevationCalibration)
  const contoursVersion = useStore((s) => s.contoursVersion)
  const setContoursGenerating = useStore((s) => s.setContoursGenerating)
  const mapTool = useStore((s) => s.mapTool)
  const elevationFlags = useStore((s) => s.elevationFlags)
  const addElevationFlag = useStore((s) => s.addElevationFlag)
  const updateElevationFlag = useStore((s) => s.updateElevationFlag)
  const removeElevationFlag = useStore((s) => s.removeElevationFlag)
  const slopeArrows = useStore((s) => s.slopeArrows)
  const addSlopeArrow = useStore((s) => s.addSlopeArrow)
  const updateSlopeArrow = useStore((s) => s.updateSlopeArrow)
  const removeSlopeArrow = useStore((s) => s.removeSlopeArrow)
  const setMapTool = useStore((s) => s.setMapTool)

  // Refs so effects and stable callbacks always read the latest values
  const parametersRef = useRef(parameters)
  parametersRef.current = parameters
  const elevationCalibrationRef = useRef(elevationCalibration)
  elevationCalibrationRef.current = elevationCalibration
  const heightmapRef = useRef(heightmap)
  heightmapRef.current = heightmap

  const [contourState, setContourState] = useState<ContourState | null>(null)

  // Unified selection and drag state for all annotation tools
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  const [dragPos, setDragPos] = useState<DragPos | null>(null)
  const [hoverPos, setHoverPos] = useState<DragPos | null>(null)
  const dragRef = useRef<DragRef | null>(null)
  const flagSvgRef = useRef<SVGSVGElement>(null)
  const selectedItemRef = useRef<SelectedItem | null>(null)
  selectedItemRef.current = selectedItem

  // Only recompute contours when a new heightmap is loaded or Recalculate is clicked.
  // 300ms delay gives the browser time to paint the spinner before the synchronous
  // computation runs. Calibration values are snapshotted here so labels match the
  // contour lines they annotate, not whatever is currently in the parameter fields.
  useEffect(() => {
    if (!heightmap) { setContourState(null); setContoursGenerating(false); return }
    let cancelled = false
    const timer = setTimeout(() => {
      if (cancelled) return
      const params = parametersRef.current
      const cal = elevationCalibrationRef.current

      // Compute the normalised threshold that corresponds to real-world elevation 0 (sea level)
      let seaLevelThreshold: number | undefined
      if (cal.realMin !== null && cal.realMax !== null && cal.realMin < 0 && cal.realMax > 0) {
        const normSpan = params.maxElevation - params.minElevation
        const realSpan = cal.realMax - cal.realMin
        if (normSpan > 0 && realSpan > 0) {
          seaLevelThreshold = params.minElevation + (-cal.realMin / realSpan) * normSpan
        }
      }

      setContourState({
        contourSet: generateContours(heightmap, params, seaLevelThreshold),
        realMin: cal.realMin,
        realMax: cal.realMax,
        realInterval: cal.realInterval,
        minElevation: params.minElevation,
        maxElevation: params.maxElevation,
      })
      setContoursGenerating(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [heightmap, contoursVersion])

  // Convert screen coordinates to SVG viewBox coordinates using the flag SVG's CTM
  const getSvgPoint = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
    const svg = flagSvgRef.current
    if (!svg) return null
    const ctm = svg.getScreenCTM()
    if (!ctm) return null
    const svgPt = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse())
    return { x: svgPt.x, y: svgPt.y }
  }, [])

  // Look up the real-world elevation at any SVG coordinate (uses refs — always current)
  const computeElevationAt = useCallback((svgX: number, svgY: number): number | null => {
    const hm = heightmapRef.current
    const cal = elevationCalibrationRef.current
    const params = parametersRef.current
    if (!hm || cal.realMin === null || cal.realMax === null) return null
    const px = Math.min(Math.max(Math.round(svgX), 0), hm.width - 1)
    const py = Math.min(Math.max(Math.round(svgY), 0), hm.height - 1)
    const normVal = hm.data[py * hm.width + px]
    const normSpan = params.maxElevation - params.minElevation
    if (normSpan === 0) return null
    return Math.round(cal.realMin + (normVal - params.minElevation) / normSpan * (cal.realMax - cal.realMin))
  }, [])

  // Compute slope angle and ascent direction at any SVG coordinate (uses refs — always current)
  const computeSlopeAt = useCallback((svgX: number, svgY: number): { angleDeg: number; slopeDeg: number } | null => {
    const hm = heightmapRef.current
    const cal = elevationCalibrationRef.current
    if (!hm || cal.realMin === null || cal.realMax === null || !cal.mapWidth || cal.mapWidth <= 0) return null
    const px = Math.min(Math.max(Math.round(svgX), 0), hm.width - 1)
    const py = Math.min(Math.max(Math.round(svgY), 0), hm.height - 1)
    // Central differences with boundary clamping
    const x0 = Math.max(px - 1, 0), x1 = Math.min(px + 1, hm.width - 1)
    const y0 = Math.max(py - 1, 0), y1 = Math.min(py + 1, hm.height - 1)
    const gx = (hm.data[py * hm.width + x1] - hm.data[py * hm.width + x0]) / (x1 - x0)
    const gy = (hm.data[y1 * hm.width + px] - hm.data[y0 * hm.width + px]) / (y1 - y0)
    const gradMag = Math.sqrt(gx * gx + gy * gy)
    const elevRange = Math.abs(cal.realMax - cal.realMin)
    const groundRes = cal.mapWidth / hm.width
    const slopeDeg = Math.round(Math.atan((gradMag * elevRange) / groundRes) * 180 / Math.PI)
    const angleDeg = Math.atan2(gy, gx) * 180 / Math.PI
    return { angleDeg, slopeDeg }
  }, [])

  // Escape cancels the active tool; Delete removes the selected annotation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMapTool('none')
        setSelectedItem(null)
        dragRef.current = null
        setDragPos(null)
        setHoverPos(null)
      }
      if (e.key === 'Delete' && selectedItemRef.current) {
        const { type, id } = selectedItemRef.current
        if (type === 'flag') removeElevationFlag(id)
        else removeSlopeArrow(id)
        setSelectedItem(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [setMapTool, removeElevationFlag, removeSlopeArrow])

  // Document-level drag handlers so drag works even when cursor leaves the SVG
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const pt = getSvgPoint(e.clientX, e.clientY)
      if (!pt) return
      const dx = pt.x - dragRef.current.startX
      const dy = pt.y - dragRef.current.startY
      if (!dragRef.current.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        dragRef.current.moved = true
      }
      if (!dragRef.current.moved) return
      if (dragRef.current.type === 'flag') {
        const elevation = computeElevationAt(pt.x, pt.y)
        setDragPos({ x: pt.x, y: pt.y, elevation: elevation ?? 0 })
      } else {
        const slope = computeSlopeAt(pt.x, pt.y)
        setDragPos({ x: pt.x, y: pt.y, angleDeg: slope?.angleDeg ?? 0, slopeDeg: slope?.slopeDeg ?? 0 })
      }
    }
    const onUp = (e: MouseEvent) => {
      if (!dragRef.current) return
      const { type, itemId, moved } = dragRef.current
      if (moved) {
        const pt = getSvgPoint(e.clientX, e.clientY)
        if (pt) {
          if (type === 'flag') {
            const elev = computeElevationAt(pt.x, pt.y) ?? 0
            updateElevationFlag(itemId, { x: pt.x, y: pt.y, elevation: elev })
          } else {
            const slope = computeSlopeAt(pt.x, pt.y)
            if (slope) updateSlopeArrow(itemId, { x: pt.x, y: pt.y, ...slope })
          }
        }
      } else {
        setSelectedItem({ type, id: itemId })
      }
      dragRef.current = null
      setDragPos(null)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [getSvgPoint, computeElevationAt, computeSlopeAt, updateElevationFlag, updateSlopeArrow])

  // Clear hover preview whenever the tool mode is turned off
  useEffect(() => {
    if (mapTool === 'none') setHoverPos(null)
  }, [mapTool])

  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!toolActive || dragRef.current) { setHoverPos(null); return }
    const pt = getSvgPoint(e.clientX, e.clientY)
    if (!pt) return
    if (mapTool === 'elevation-flag') {
      const elevation = computeElevationAt(pt.x, pt.y)
      setHoverPos(elevation !== null ? { x: pt.x, y: pt.y, elevation } : null)
    } else if (mapTool === 'slope-arrow') {
      const slope = computeSlopeAt(pt.x, pt.y)
      setHoverPos(slope ? { x: pt.x, y: pt.y, ...slope } : null)
    }
  }

  function handleSvgMouseLeave() {
    setHoverPos(null)
  }

  function handleItemMouseDown(e: React.MouseEvent, type: 'flag' | 'slope-arrow', itemId: string) {
    e.stopPropagation()
    const pt = getSvgPoint(e.clientX, e.clientY)
    if (!pt) return
    dragRef.current = { type, itemId, startX: pt.x, startY: pt.y, moved: false }
  }

  // Fires only for background clicks — annotation elements call stopPropagation
  function handleSvgMouseDown(_e: React.MouseEvent<SVGSVGElement>) {
    setSelectedItem(null)
  }

  // Fires for background mouseup — drag/select is handled by the document listener
  function handleSvgMouseUp(e: React.MouseEvent<SVGSVGElement>) {
    if (dragRef.current) return
    const pt = getSvgPoint(e.clientX, e.clientY)
    if (!pt) return
    if (mapTool === 'elevation-flag') {
      const elev = computeElevationAt(pt.x, pt.y)
      if (elev !== null) {
        addElevationFlag({ id: crypto.randomUUID(), x: pt.x, y: pt.y, elevation: elev } as ElevationFlag)
      }
    } else if (mapTool === 'slope-arrow') {
      const slope = computeSlopeAt(pt.x, pt.y)
      if (slope) {
        addSlopeArrow({ id: crypto.randomUUID(), x: pt.x, y: pt.y, ...slope } as SlopeArrow)
      }
    }
  }

  const mapZoom = useStore((s) => s.mapZoom)
  const overlayOnly = useStore((s) => s.overlayOnly)
  const overlayBrightness = useStore((s) => s.overlayBrightness)
  const frame = useStore((s) => s.frame)

  const baseImageUrl = activeTab === 'terrain' ? terrainImageUrl : hillshadeImageUrl
  const showPlaceholder = !baseImageUrl && !heightmap && !hillshadeGenerating && !fileLoadingMessage

  const showLabels = style.showLabels
    && contourState !== null
    && contourState.realMin !== null
    && contourState.realMax !== null

  const labelFontSize = heightmap ? heightmap.width * style.labelFontSize / 500 : 10
  const seaLevelLabelFontSize = heightmap ? heightmap.width * style.seaLevelLabelFontSize / 500 : 10
  const seaLevelLabelPt = (style.showSeaLevel && style.showSeaLevelLabel && contourState?.contourSet.seaLevelPath)
    ? getLabelPoint(contourState.contourSet.seaLevelPath)
    : null

  const toolActive = mapTool === 'elevation-flag' || mapTool === 'slope-arrow'
  const flagSvgInteractive = toolActive || elevationFlags.length > 0 || slopeArrows.length > 0

  return (
    <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: 0, overflow: 'auto' }}>
      {showPlaceholder && (
        <Center style={{ height: '100%', minHeight: 200 }}>
          <Text c="dimmed" size="sm">Load a terrain image and heightmap to get started</Text>
        </Center>
      )}

      {/* Outer composition div — establishes total width, includes frame margins */}
      <div style={{
        position: 'relative',
        display: 'inline-block',
        width: `${mapZoom}%`,
        backgroundColor: (frame.enabled && heightmap) ? frame.marginColor : undefined,
        padding: (frame.enabled && heightmap)
          ? `${frame.marginTop}px ${frame.marginRight}px ${frame.marginBottom}px ${frame.marginLeft}px`
          : undefined,
      }}>

      {/* Inner map area — position relative so SVG overlays stack correctly */}
      <div style={{
        position: 'relative',
        backgroundColor: overlayOnly
          ? `rgb(${Math.round(255 * (0.85 + 0.15 * overlayBrightness))},` +
            `${Math.round(255 * (0.85 + 0.15 * overlayBrightness))},` +
            `${Math.round(255 * (0.85 + 0.15 * overlayBrightness))})`
          : undefined,
      }}>
      {baseImageUrl && !overlayOnly && (
        <img
          src={baseImageUrl}
          alt={activeTab === 'terrain' ? 'Terrain' : 'Hillshade'}
          style={{ display: 'block', width: '100%' }}
        />
      )}
      {baseImageUrl && overlayOnly && (
        <img
          src={baseImageUrl}
          alt=""
          aria-hidden
          style={{ display: 'block', width: '100%', visibility: 'hidden' }}
        />
      )}

      {contourState && heightmap && !hillshadeGenerating && (
        <svg
          id="contour-svg"
          viewBox={`0 0 ${heightmap.width} ${heightmap.height}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            opacity: style.opacity,
            pointerEvents: 'none',
          }}
        >
          {contourState.contourSet.paths.map((polygon, i) => {
            const isMajor = contourState.contourSet.majorIndices.has(i)
            return (
              <path
                key={i}
                d={contourToSvgPath(polygon)}
                fill="none"
                stroke={isMajor ? style.majorColor : style.minorColor}
                strokeWidth={isMajor ? style.majorWidth : style.minorWidth}
                vectorEffect="non-scaling-stroke"
              />
            )
          })}

          {showLabels && contourState.contourSet.paths.map((polygon, i) => {
            if (!contourState.contourSet.majorIndices.has(i)) return null
            const pt = getLabelPoint(polygon)
            if (!pt) return null
            const { realMin, realMax, realInterval, minElevation, maxElevation } = contourState
            const normSpan = maxElevation - minElevation
            const elev = (realInterval !== null)
              ? realMin! + i * realInterval
              : normSpan > 0
                ? Math.round(realMin! + (contourState.contourSet.thresholds[i] - minElevation) / normSpan * (realMax! - realMin!))
                : realMin!
            return (
              <text
                key={`lbl-${i}`}
                x={pt[0]}
                y={pt[1]}
                fontSize={labelFontSize}
                fontFamily={style.labelFont}
                fontWeight={style.labelBold ? 'bold' : 'normal'}
                fontStyle={style.labelItalic ? 'italic' : 'normal'}
                fill={style.labelColor}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {elev}
              </text>
            )
          })}

          {style.showSeaLevel && contourState.contourSet.seaLevelPath && (
            <path
              d={contourToSvgPath(contourState.contourSet.seaLevelPath)}
              fill="none"
              stroke={style.seaLevelColor}
              strokeWidth={style.seaLevelWidth}
              strokeDasharray={
                style.seaLevelDash === 'dashed' ? '8 4' :
                style.seaLevelDash === 'dotted' ? '2 4' :
                undefined
              }
              vectorEffect="non-scaling-stroke"
            />
          )}

          {seaLevelLabelPt && (
            <g transform={`translate(${seaLevelLabelPt[0]}, ${seaLevelLabelPt[1]}) scale(${seaLevelLabelFontSize})`}>
              <path
                d="M 0 -0.50 L -0.18 -0.22 L -0.06 -0.22 L -0.06 0.05 L 0.06 0.05 L 0.06 -0.22 L 0.18 -0.22 Z"
                fill={style.seaLevelLabelColor}
              />
              <path
                d="M -0.40 0.18 C -0.27 0.06, -0.13 0.30, 0 0.18 C 0.13 0.06, 0.27 0.30, 0.40 0.18"
                fill="none"
                stroke={style.seaLevelLabelColor}
                strokeWidth={0.08}
              />
              <path
                d="M -0.40 0.38 C -0.27 0.26, -0.13 0.50, 0 0.38 C 0.13 0.26, 0.27 0.50, 0.40 0.38"
                fill="none"
                stroke={style.seaLevelLabelColor}
                strokeWidth={0.08}
              />
            </g>
          )}
        </svg>
      )}

      {/* Annotation overlay — separate SVG at full opacity, handles all tool interaction */}
      {heightmap && (
        <svg
          id="annotation-svg"
          ref={flagSvgRef}
          viewBox={`0 0 ${heightmap.width} ${heightmap.height}`}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: flagSvgInteractive ? 'auto' : 'none',
            cursor: toolActive ? 'crosshair' : 'default',
          }}
          onMouseDown={handleSvgMouseDown}
          onMouseUp={handleSvgMouseUp}
          onMouseMove={handleSvgMouseMove}
          onMouseLeave={handleSvgMouseLeave}
        >
          {/* Transparent background rect captures clicks for placement */}
          {toolActive && (
            <rect
              x={0} y={0}
              width={heightmap.width} height={heightmap.height}
              fill="transparent"
            />
          )}

          {/* Elevation flags */}
          {elevationFlags.map((flag) => {
            const isDragging = dragPos !== null && dragRef.current?.itemId === flag.id && dragRef.current.type === 'flag'
            const fx = isDragging ? dragPos!.x : flag.x
            const fy = isDragging ? dragPos!.y : flag.y
            const displayElev = isDragging ? (dragPos!.elevation ?? flag.elevation) : flag.elevation
            const isSelected = selectedItem?.type === 'flag' && selectedItem.id === flag.id
            const s = labelFontSize
            const flagColor = isSelected ? style.majorColor : style.labelColor

            return (
              <g
                key={flag.id}
                onMouseDown={(e) => handleItemMouseDown(e, 'flag', flag.id)}
                style={{ cursor: isSelected ? 'grab' : 'pointer' }}
              >
                <line
                  x1={fx} y1={fy}
                  x2={fx} y2={fy - s}
                  stroke={flagColor}
                  strokeWidth={isSelected ? 2 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
                <polygon
                  points={`${fx},${fy - s} ${fx + s * 0.5},${fy - s * 0.78} ${fx},${fy - s * 0.57}`}
                  fill={flagColor}
                />
                <text
                  x={fx + s * 0.55}
                  y={fy - s * 0.65}
                  fontSize={labelFontSize}
                  fontFamily={style.labelFont}
                  fontWeight={style.labelBold ? 'bold' : 'normal'}
                  fontStyle={style.labelItalic ? 'italic' : 'normal'}
                  fill={style.labelColor}
                  dominantBaseline="middle"
                >{displayElev}</text>
                {isSelected && (
                  <circle
                    cx={fx} cy={fy}
                    r={s * 0.12}
                    fill="none"
                    stroke={style.majorColor}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            )
          })}

          {/* Slope arrows */}
          {slopeArrows.map((arrow) => {
            const isDragging = dragPos !== null && dragRef.current?.itemId === arrow.id && dragRef.current.type === 'slope-arrow'
            const fx = isDragging ? dragPos!.x : arrow.x
            const fy = isDragging ? dragPos!.y : arrow.y
            const displayAngle = isDragging ? (dragPos!.angleDeg ?? arrow.angleDeg) : arrow.angleDeg
            const displaySlope = isDragging ? (dragPos!.slopeDeg ?? arrow.slopeDeg) : arrow.slopeDeg
            const isSelected = selectedItem?.type === 'slope-arrow' && selectedItem.id === arrow.id
            const s = labelFontSize
            const arrowColor = isSelected ? style.majorColor : style.labelColor

            // Compute arrow geometry in SVG coordinates
            const angleRad = (displayAngle * Math.PI) / 180
            const cos = Math.cos(angleRad)
            const sin = Math.sin(angleRad)
            const halfLen = s * 0.5
            const headLen = s * 0.28
            const headWid = s * 0.18
            const tipX = fx + cos * halfLen
            const tipY = fy + sin * halfLen
            const tailX = fx - cos * halfLen
            const tailY = fy - sin * halfLen
            const headBaseX = tipX - cos * headLen
            const headBaseY = tipY - sin * headLen
            // Perpendicular direction for arrowhead width
            const perpX = -sin
            const perpY = cos
            const arrowPoints = [
              `${tipX},${tipY}`,
              `${headBaseX + perpX * headWid},${headBaseY + perpY * headWid}`,
              `${headBaseX - perpX * headWid},${headBaseY - perpY * headWid}`,
            ].join(' ')

            return (
              <g
                key={arrow.id}
                onMouseDown={(e) => handleItemMouseDown(e, 'slope-arrow', arrow.id)}
                style={{ cursor: isSelected ? 'grab' : 'pointer' }}
              >
                {/* Shaft */}
                <line
                  x1={tailX} y1={tailY}
                  x2={headBaseX} y2={headBaseY}
                  stroke={arrowColor}
                  strokeWidth={isSelected ? 2 : 1.5}
                  vectorEffect="non-scaling-stroke"
                />
                {/* Arrowhead */}
                <polygon points={arrowPoints} fill={arrowColor} />
                {/* Degree label — always horizontal, below the arrow center */}
                <text
                  x={fx}
                  y={fy + s * 0.85}
                  fontSize={labelFontSize}
                  fontFamily={style.labelFont}
                  fontWeight={style.labelBold ? 'bold' : 'normal'}
                  fontStyle={style.labelItalic ? 'italic' : 'normal'}
                  fill={style.labelColor}
                  textAnchor="middle"
                  dominantBaseline="middle"
                >{displaySlope}°</text>
                {/* Selection ring at center */}
                {isSelected && (
                  <circle
                    cx={fx} cy={fy}
                    r={s * 0.12}
                    fill="none"
                    stroke={style.majorColor}
                    strokeWidth={2}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
              </g>
            )
          })}
          {/* Hover preview — live readout while tool is active, no drag in progress */}
          {toolActive && hoverPos && !dragPos && (() => {
            const s = labelFontSize
            if (mapTool === 'elevation-flag' && hoverPos.elevation !== undefined) {
              return (
                <text
                  x={hoverPos.x + s * 0.9}
                  y={hoverPos.y - s * 0.3}
                  fontSize={s}
                  fontFamily={style.labelFont}
                  fontWeight={style.labelBold ? 'bold' : 'normal'}
                  fontStyle={style.labelItalic ? 'italic' : 'normal'}
                  fill={style.labelColor}
                  dominantBaseline="middle"
                  style={{ pointerEvents: 'none' }}
                  opacity={0.75}
                >{hoverPos.elevation}</text>
              )
            }
            if (mapTool === 'slope-arrow' && hoverPos.angleDeg !== undefined && hoverPos.slopeDeg !== undefined) {
              const angleRad = (hoverPos.angleDeg * Math.PI) / 180
              const cos = Math.cos(angleRad)
              const sin = Math.sin(angleRad)
              const halfLen = s * 0.5
              const headLen = s * 0.28
              const headWid = s * 0.18
              const tipX = hoverPos.x + cos * halfLen
              const tipY = hoverPos.y + sin * halfLen
              const tailX = hoverPos.x - cos * halfLen
              const tailY = hoverPos.y - sin * halfLen
              const headBaseX = tipX - cos * headLen
              const headBaseY = tipY - sin * headLen
              const perpX = -sin
              const perpY = cos
              const arrowPoints = [
                `${tipX},${tipY}`,
                `${headBaseX + perpX * headWid},${headBaseY + perpY * headWid}`,
                `${headBaseX - perpX * headWid},${headBaseY - perpY * headWid}`,
              ].join(' ')
              return (
                <g opacity={0.75} style={{ pointerEvents: 'none' }}>
                  <line
                    x1={tailX} y1={tailY} x2={headBaseX} y2={headBaseY}
                    stroke={style.labelColor} strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                  />
                  <polygon points={arrowPoints} fill={style.labelColor} />
                  <text
                    x={hoverPos.x}
                    y={hoverPos.y + s * 0.85}
                    fontSize={s}
                    fontFamily={style.labelFont}
                    fontWeight={style.labelBold ? 'bold' : 'normal'}
                    fontStyle={style.labelItalic ? 'italic' : 'normal'}
                    fill={style.labelColor}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >{hoverPos.slopeDeg}°</text>
                </g>
              )
            }
            return null
          })()}
        </svg>
      )}

      </div>{/* end inner map area */}

      {/* Frame border overlay — rendered over the entire composition (margins + map) */}
      {frame.enabled && frame.borderEnabled && heightmap && (
        <FrameBorderOverlay frame={frame} />
      )}

      </div>{/* end outer composition div */}

      {(hillshadeGenerating || fileLoadingMessage) && (
        <Overlay backgroundOpacity={0.5} style={{ position: 'absolute', inset: 0 }}>
          <Center style={{ height: '100%' }}>
            <Stack align="center" gap="xs">
              <Loader size="lg" />
              <Text size="sm" c="white">
                {fileLoadingMessage ?? 'Generating hillshade…'}
              </Text>
            </Stack>
          </Center>
        </Overlay>
      )}
    </div>
  )
}
