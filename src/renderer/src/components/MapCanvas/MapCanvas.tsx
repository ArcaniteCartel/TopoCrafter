import { useCallback, useEffect, useRef, useState } from 'react'
import { Center, Text, Stack, Loader, Overlay } from '@mantine/core'
import type { ContourMultiPolygon } from 'd3-contour'
import { useStore } from '../../store/useStore'
import { generateContours, contourToSvgPath } from '../../utils/contour'
import type { ContourSet } from '../../utils/contour'
import type { ElevationFlag, SlopeArrow, FrameConfig, CompassConfig } from '../../types'

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

// ---------------------------------------------------------------------------
// Compass rose — shared helpers
// ---------------------------------------------------------------------------

interface RoseProps { s: number; color: string; lw: number; gap: number; fs: number; compass: CompassConfig }

function RLabel({ x, y, text, color, fs, dx, dy }: {
  x: number; y: number; text: string; color: string; fs: number; dx: number; dy: number
}): JSX.Element | null {
  if (!text.trim()) return null
  return (
    <text x={x} y={y} fontSize={fs} fontFamily="serif" fill={color}
      textAnchor={dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle'}
      dominantBaseline={dy > 0 ? 'hanging' : dy < 0 ? 'auto' : 'middle'}>
      {text}
    </text>
  )
}

function CardinalLabels({ s, gap, fs, color, compass, nExtra = 0 }: {
  s: number; gap: number; fs: number; color: string; compass: CompassConfig; nExtra?: number
}): JSX.Element {
  return (
    <>
      <RLabel x={0}       y={-(s+gap+nExtra)} text={compass.topLabel}    color={color} fs={fs} dx={0}  dy={-1} />
      <RLabel x={s+gap}   y={0}               text={compass.rightLabel}  color={color} fs={fs} dx={1}  dy={0}  />
      <RLabel x={0}       y={s+gap}           text={compass.bottomLabel} color={color} fs={fs} dx={0}  dy={1}  />
      <RLabel x={-(s+gap)} y={0}              text={compass.leftLabel}   color={color} fs={fs} dx={-1} dy={0}  />
    </>
  )
}

// ---------------------------------------------------------------------------
// Plain (original 4-arm lines)
// ---------------------------------------------------------------------------

function PlainRose({ s, color, lw, gap, fs, compass }: RoseProps): JSX.Element {
  const hl = s * 0.3, hw = s * 0.14
  const arms = [
    { dx:  0, dy: -1, label: compass.topLabel,    arrow: compass.topArrow    },
    { dx:  1, dy:  0, label: compass.rightLabel,  arrow: compass.rightArrow  },
    { dx:  0, dy:  1, label: compass.bottomLabel, arrow: compass.bottomArrow },
    { dx: -1, dy:  0, label: compass.leftLabel,   arrow: compass.leftArrow   },
  ]
  return (
    <g>
      <circle r={lw * 1.5} fill={color} />
      {arms.map(({ dx, dy, label, arrow }, i) => {
        const tx = dx*s, ty = dy*s
        const bx = dx*(s-hl), by = dy*(s-hl)
        return (
          <g key={i}>
            <line x1={0} y1={0} x2={arrow ? bx : tx} y2={arrow ? by : ty}
              stroke={color} strokeWidth={lw} strokeLinecap="round" />
            {arrow && <polygon points={`${tx},${ty} ${bx-dy*hw},${by+dx*hw} ${bx+dy*hw},${by-dx*hw}`} fill={color} />}
            <RLabel x={dx*(s+gap)} y={dy*(s+gap)} text={label} color={color} fs={fs} dx={dx} dy={dy} />
          </g>
        )
      })}
    </g>
  )
}

// ---------------------------------------------------------------------------
// Compass Star (two overlapping 4-pointed stars, N arm white)
// ---------------------------------------------------------------------------

function CompassStarRose({ s, color, lw, gap, fs, compass }: RoseProps): JSX.Element {
  const ir = s * 0.22
  const is_ = s * 0.65, ir2 = is_ * 0.22
  const sq = Math.SQRT2 / 2
  const cardPts = [[0,-s],[ir,-ir],[s,0],[ir,ir],[0,s],[-ir,ir],[-s,0],[-ir,-ir]].map(p=>p.join(',')).join(' ')
  const icPts   = [[is_*sq,-is_*sq],[ir2,0],[is_*sq,is_*sq],[0,ir2],[-is_*sq,is_*sq],[-ir2,0],[-is_*sq,-is_*sq],[0,-ir2]].map(p=>p.join(',')).join(' ')
  const nPts    = `0,${-s} ${ir},${-ir} 0,0 ${-ir},${-ir}`
  return (
    <g>
      <polygon points={icPts} fill={color} />
      <polygon points={cardPts} fill={color} />
      <polygon points={nPts} fill="white" />
      <polygon points={nPts} fill="none" stroke={color} strokeWidth={lw * 0.5} />
      <circle r={lw * 2} fill={color} />
      <CardinalLabels s={s} gap={gap} fs={fs} color={color} compass={compass} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Nautical (16-point windrose, N arm white + fleur-de-lis)
// ---------------------------------------------------------------------------

function NauticalRose({ s, color, lw, gap, fs, compass }: RoseProps): JSX.Element {
  const fr = s * 0.2
  const diamonds = Array.from({ length: 16 }, (_, i) => {
    const θ = i * 22.5 * Math.PI / 180
    const dx = Math.sin(θ), dy = -Math.cos(θ), px = Math.cos(θ), py = Math.sin(θ)
    const isC = i % 4 === 0, isIC = i % 4 === 2
    const tl = isC ? s : isIC ? s*0.72 : s*0.48
    const hw = isC ? s*0.18 : isIC ? s*0.13 : s*0.06
    const pts = [[dx*tl,dy*tl],[px*hw,py*hw],[0,0],[-px*hw,-py*hw]].map(p=>p.join(',')).join(' ')
    return { pts, isN: i === 0 }
  })
  return (
    <g>
      <circle r={s * 0.22} fill="none" stroke={color} strokeWidth={lw} />
      {diamonds.map(({ pts, isN }, i) => (
        <polygon key={i} points={pts}
          fill={isN ? 'white' : color}
          stroke={isN ? color : 'none'}
          strokeWidth={isN ? lw * 0.5 : 0} />
      ))}
      {/* Fleur-de-lis at N tip: 3 prongs + collar bar */}
      <g stroke={color} strokeWidth={lw * 0.9} strokeLinecap="round" fill="none">
        <line x1={0}       y1={-s}          x2={0}        y2={-(s+fr)}       />
        <line x1={0}       y1={-s}          x2={-fr*0.55} y2={-(s+fr*0.5)}   />
        <line x1={0}       y1={-s}          x2={fr*0.55}  y2={-(s+fr*0.5)}   />
        <line x1={-fr*0.65} y1={-s+fr*0.15} x2={fr*0.65}  y2={-s+fr*0.15}   />
      </g>
      <circle r={lw * 2} fill={color} />
      <CardinalLabels s={s} gap={gap} fs={fs} color={color} compass={compass} nExtra={fr * 0.8} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Celtic (cross with ring, double-band groove effect, terminal knots)
// ---------------------------------------------------------------------------

function CelticRose({ s, color, lw, gap, fs, compass }: RoseProps): JSX.Element {
  const aw = s * 0.22, ah = aw / 2, rr = s * 0.40, gw = aw * 0.38
  const termR = ah * 0.85
  return (
    <g>
      {/* Cross arms */}
      <rect x={-ah} y={-s} width={aw} height={s*2} fill={color} rx={ah} />
      <rect x={-s} y={-ah} width={s*2} height={aw} fill={color} rx={ah} />
      {/* Ring donut */}
      <circle r={rr} fill="none" stroke={color} strokeWidth={aw} />
      {/* Groove channels along exposed arm sections */}
      <g stroke="white" strokeOpacity={0.55} strokeLinecap="round" fill="none">
        <line x1={0} y1={-(rr+ah)} x2={0} y2={-(s-termR)} strokeWidth={gw} />
        <line x1={0} y1={rr+ah}    x2={0} y2={s-termR}    strokeWidth={gw} />
        <line x1={-(rr+ah)} y1={0} x2={-(s-termR)} y2={0} strokeWidth={gw} />
        <line x1={rr+ah}    y1={0} x2={s-termR}    y2={0} strokeWidth={gw} />
        <circle r={rr} strokeWidth={gw} />
      </g>
      {/* Terminal knot circles */}
      {([[0,-1],[1,0],[0,1],[-1,0]] as [number,number][]).map(([dx,dy],i) => (
        <g key={i}>
          <circle cx={dx*s} cy={dy*s} r={termR} fill={color} />
          <circle cx={dx*s} cy={dy*s} r={termR*0.52} fill="none" stroke="white" strokeOpacity={0.55} strokeWidth={gw*0.65} />
        </g>
      ))}
      <circle r={ah * 0.55} fill={color} />
      <CardinalLabels s={s} gap={gap + termR} fs={fs} color={color} compass={compass} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Dragon / Vegvisir-inspired (8 runic staves, branches, fork terminals)
// ---------------------------------------------------------------------------

function DragonRose({ s, color, lw, gap, fs, compass }: RoseProps): JSX.Element {
  const forkLen = s * 0.15, forkAngle = Math.PI / 6
  const cosF = Math.cos(forkAngle), sinF = Math.sin(forkAngle)
  const elements: JSX.Element[] = []

  for (let i = 0; i < 8; i++) {
    const θ = i * Math.PI / 4
    const dx = Math.sin(θ), dy = -Math.cos(θ), px = Math.cos(θ), py = Math.sin(θ)
    const isCardinal = i % 2 === 0
    const tl = isCardinal ? s : s * 0.76

    // Shaft
    elements.push(
      <line key={`s${i}`} x1={0} y1={0} x2={dx*tl} y2={dy*tl}
        stroke={color} strokeWidth={lw * 1.2} strokeLinecap="round" />
    )
    // Branches
    if (isCardinal) {
      const bps: [number, number, number][] = [[0.60, 0.21, 0], [0.80, 0.14, 0]]
      bps.forEach(([frac, hr], j) => {
        const bx = dx*tl*frac, by = dy*tl*frac
        elements.push(
          <line key={`b${i}_${j}`} x1={bx-px*s*hr} y1={by-py*s*hr} x2={bx+px*s*hr} y2={by+py*s*hr}
            stroke={color} strokeWidth={lw} strokeLinecap="round" />
        )
      })
    } else {
      const bx = dx*tl*0.65, by = dy*tl*0.65
      elements.push(
        <line key={`b${i}`} x1={bx-px*s*0.13} y1={by-py*s*0.13} x2={bx+px*s*0.13} y2={by+py*s*0.13}
          stroke={color} strokeWidth={lw} strokeLinecap="round" />
      )
    }
    // Fork terminal (dragon tail)
    const f1dx = dx*cosF - dy*sinF, f1dy = dx*sinF + dy*cosF
    const f2dx = dx*cosF + dy*sinF, f2dy = -dx*sinF + dy*cosF
    elements.push(
      <line key={`f1${i}`} x1={dx*tl} y1={dy*tl} x2={dx*tl+f1dx*forkLen} y2={dy*tl+f1dy*forkLen}
        stroke={color} strokeWidth={lw} strokeLinecap="round" />,
      <line key={`f2${i}`} x1={dx*tl} y1={dy*tl} x2={dx*tl+f2dx*forkLen} y2={dy*tl+f2dy*forkLen}
        stroke={color} strokeWidth={lw} strokeLinecap="round" />
    )
  }

  // Center: runic ring + dot
  const cr = lw * 4.5
  elements.push(
    <circle key="cr" r={cr} fill="none" stroke={color} strokeWidth={lw * 0.8} />,
    <circle key="cd" r={lw * 1.8} fill={color} />
  )

  return (
    <g>
      {elements}
      <CardinalLabels s={s} gap={gap + s * 0.14} fs={fs} color={color} compass={compass} />
    </g>
  )
}

// ---------------------------------------------------------------------------
// Compass rose SVG container — dispatches to style
// ---------------------------------------------------------------------------

function CompassRoseSvg({ compass, frame }: { compass: CompassConfig; frame: FrameConfig }): JSX.Element {
  const { size: s, color, lineWidth: lw } = compass
  const fs = Math.max(8, Math.round(s * 0.35))
  const gap = fs * 0.8
  const svgPad = s * 0.22 + fs * 1.4
  const svgR = s + svgPad
  const svgSize = svgR * 2
  const roseProps: RoseProps = { s, color, lw, gap, fs, compass }

  let rose: JSX.Element
  switch (compass.compassStyle) {
    case 'compass':  rose = <CompassStarRose {...roseProps} />; break
    case 'nautical': rose = <NauticalRose    {...roseProps} />; break
    case 'celtic':   rose = <CelticRose      {...roseProps} />; break
    case 'dragon':   rose = <DragonRose      {...roseProps} />; break
    default:         rose = <PlainRose       {...roseProps} />; break
  }

  return (
    <svg
      width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}
      style={{
        position: 'absolute',
        left: `calc(50% - ${svgR}px)`,
        bottom: `calc(${frame.marginBottom / 2}px - ${svgR}px)`,
        pointerEvents: 'none',
        overflow: 'visible',
      }}
    >
      <g transform={`translate(${svgR},${svgR})`}>
        {rose}
      </g>
    </svg>
  )
}

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
  const title = useStore((s) => s.title)
  const compass = useStore((s) => s.compass)

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

      {/* Title — absolutely positioned in the top margin area */}
      {frame.enabled && title.enabled && title.text.trim() && (
        <div style={{
          position: 'absolute',
          top: frame.marginTop / 2,
          left: frame.marginLeft,
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
          userSelect: 'none',
          color: title.color,
          fontFamily: title.font,
          fontSize: title.size,
          fontWeight: title.bold ? 'bold' : 'normal',
          fontStyle: title.italic ? 'italic' : 'normal',
          whiteSpace: 'nowrap',
          lineHeight: 1,
        }}>
          {title.text}
        </div>
      )}

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

      {/* Compass rose — bottom-centre of the composition */}
      {frame.enabled && compass.enabled && heightmap && (
        <CompassRoseSvg compass={compass} frame={frame} />
      )}

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
