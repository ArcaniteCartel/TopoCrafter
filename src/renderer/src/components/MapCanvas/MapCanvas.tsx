import { useCallback, useEffect, useRef, useState } from 'react'
import { Center, Text, Stack, Loader, Overlay } from '@mantine/core'
import type { ContourMultiPolygon } from 'd3-contour'
import { useStore } from '../../store/useStore'
import { generateContours, contourToSvgPath } from '../../utils/contour'
import type { ContourSet } from '../../utils/contour'
import type { ElevationFlag, SlopeArrow, RuggednessFlag, SwampMarker, FrameConfig, CompassConfig, LegendConfig, ContourStyle, FramePosition, MeasureBarConfig, ElevationCalibration, HeightmapInfo } from '../../types'
import { TRI_THRESHOLDS, TRI_COLORS, TRI_LABELS, getTriSeverity } from '../../types'

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

type SelectedItem = { type: 'flag' | 'slope-arrow' | 'ruggedness-flag' | 'swamp-marker'; id: string }
type DragRef = { type: 'flag' | 'slope-arrow' | 'ruggedness-flag' | 'swamp-marker'; itemId: string; startX: number; startY: number; moved: boolean }
type DragPos = { x: number; y: number; elevation?: number; angleDeg?: number; slopeDeg?: number; triNorm?: number }

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

  const edgeGap = 4
  return (
    <svg
      width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`}
      style={{
        ...getElementPositionStyle(compass.position, frame, svgSize, svgSize, edgeGap),
        overflow: 'visible',
      }}
    >
      <g transform={`translate(${svgR},${svgR})`}>
        {rose}
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Frame positioning helpers
// ---------------------------------------------------------------------------

// For elements with known pixel dimensions (SVG overlays like compass, legend)
function getElementPositionStyle(
  pos: FramePosition,
  frame: FrameConfig,
  w: number,
  h: number,
  edgeGap: number,
): React.CSSProperties {
  const ml = frame.marginLeft, mr = frame.marginRight
  const mt = frame.marginTop, mb = frame.marginBottom
  const mco = (mt - mb) / 2
  const base: React.CSSProperties = { position: 'absolute', pointerEvents: 'none' }
  switch (pos) {
    case 'top-left':     return { ...base, top: mt/2 - h/2,                                     left: edgeGap }
    case 'top-center':   return { ...base, top: mt/2 - h/2,    left: '50%',    transform: 'translateX(-50%)' }
    case 'top-right':    return { ...base, top: mt/2 - h/2,                                     right: edgeGap }
    case 'right-top':    return { ...base, top: mt + edgeGap,                                    right: mr/2 - w/2 }
    case 'right-middle': return { ...base, top: `calc(50% + ${mco}px)`, transform: 'translateY(-50%)', right: mr/2 - w/2 }
    case 'right-bottom': return { ...base, bottom: mb + edgeGap,                                 right: mr/2 - w/2 }
    case 'bottom-right': return { ...base, bottom: mb/2 - h/2,                                  right: edgeGap }
    case 'bottom-center':return { ...base, bottom: mb/2 - h/2, left: '50%',    transform: 'translateX(-50%)' }
    case 'bottom-left':  return { ...base, bottom: mb/2 - h/2,                                  left: edgeGap }
    case 'left-bottom':  return { ...base, bottom: mb + edgeGap,                                 left: ml/2 - w/2 }
    case 'left-middle':  return { ...base, top: `calc(50% + ${mco}px)`, transform: 'translateY(-50%)', left: ml/2 - w/2 }
    case 'left-top':     return { ...base, top: mt + edgeGap,                                   left: ml/2 - w/2 }
  }
}

// For the title (variable width text) — wrapper is positioned at anchor, inner may rotate
function getTitleWrapperStyle(pos: FramePosition, frame: FrameConfig, edgeGap: number): React.CSSProperties {
  const ml = frame.marginLeft, mr = frame.marginRight
  const mt = frame.marginTop, mb = frame.marginBottom
  const mco = (mt - mb) / 2
  const base: React.CSSProperties = { position: 'absolute', pointerEvents: 'none', userSelect: 'none' }
  switch (pos) {
    case 'top-left':     return { ...base, left: edgeGap,  top:    mt/2,                      transform: 'translateY(-50%)' }
    case 'top-center':   return { ...base, left: '50%',    top:    mt/2,                      transform: 'translate(-50%, -50%)' }
    case 'top-right':    return { ...base, right: edgeGap, top:    mt/2,                      transform: 'translateY(-50%)' }
    case 'right-top':    return { ...base, right: mr/2,    top:    mt + edgeGap,              transform: 'translateX(50%)' }
    case 'right-middle': return { ...base, right: mr/2,    top:    `calc(50% + ${mco}px)`,   transform: 'translate(50%, -50%)' }
    case 'right-bottom': return { ...base, right: mr/2,    bottom: mb + edgeGap,              transform: 'translateX(50%)' }
    case 'bottom-right': return { ...base, right: edgeGap, bottom: mb/2,                      transform: 'translateY(50%)' }
    case 'bottom-center':return { ...base, left: '50%',    bottom: mb/2,                      transform: 'translate(-50%, 50%)' }
    case 'bottom-left':  return { ...base, left: edgeGap,  bottom: mb/2,                      transform: 'translateY(50%)' }
    case 'left-bottom':  return { ...base, left: ml/2,     bottom: mb + edgeGap,              transform: 'translateX(-50%)' }
    case 'left-middle':  return { ...base, left: ml/2,     top:    `calc(50% + ${mco}px)`,   transform: 'translate(-50%, -50%)' }
    case 'left-top':     return { ...base, left: ml/2,     top:    mt + edgeGap,              transform: 'translateX(-50%)' }
  }
}

// ---------------------------------------------------------------------------
// Coordinate format helper (shared by LegendOverlay and MeasureBarOverlay)
// ---------------------------------------------------------------------------

function toDMS(degrees: number, isLat: boolean): string {
  const sign = degrees < 0 ? -1 : 1
  const abs = Math.abs(degrees)
  let d = Math.floor(abs)
  const mFrac = (abs - d) * 60
  let m = Math.floor(mFrac)
  let s = Math.round((mFrac - m) * 60)
  if (s >= 60) { s = 0; m += 1 }
  if (m >= 60) { m = 0; d += 1 }
  const dir = isLat ? (sign > 0 ? 'N' : 'S') : (sign > 0 ? 'E' : 'W')
  return `${d}°${m}'${s}"${dir}`
}

// ---------------------------------------------------------------------------
// Legend overlay
// ---------------------------------------------------------------------------

function LegendOverlay({ legend, frame, style, hasElevationFlags, hasSlopeArrows, measureBar, hasRuggednessFlags, ruggednessColorBySeverity, hasSwampMarkers, swampMarkerDefaults }: {
  legend: LegendConfig; frame: FrameConfig; style: ContourStyle
  hasElevationFlags: boolean; hasSlopeArrows: boolean; measureBar?: MeasureBarConfig
  hasRuggednessFlags: boolean; ruggednessColorBySeverity: boolean
  hasSwampMarkers: boolean; swampMarkerDefaults: { color: string; boldness: 1|2|3 }
}): JSX.Element | null {
  const hasGeoAnchor = legend.showGeoAnchor && !!measureBar?.enabled && !!measureBar?.geoEnabled
  const geoAnchorLabel = hasGeoAnchor
    ? `${legend.geoAnchorLabel}: ${toDMS(measureBar!.anchorLat, true)}, ${toDMS(measureBar!.anchorLon, false)}`
    : ''
  const showColorBar = legend.showRuggednessFlags && hasRuggednessFlags
  const items = [
    legend.showMinorContour                           ? { type: 'minor',      label: legend.minorLabel         } : null,
    legend.showMajorContour                           ? { type: 'major',      label: legend.majorLabel         } : null,
    legend.showSeaLevel && style.showSeaLevel         ? { type: 'sea-level',  label: legend.seaLevelLabel      } : null,
    legend.showElevationFlags && hasElevationFlags    ? { type: 'flag',       label: legend.flagLabel          } : null,
    legend.showSlopeArrows && hasSlopeArrows          ? { type: 'arrow',      label: legend.arrowLabel         } : null,
    hasGeoAnchor                                      ? { type: 'geo-anchor', label: geoAnchorLabel            } : null,
    showColorBar                                      ? { type: 'ruggedness', label: legend.ruggednessFlagLabel} : null,
    legend.showSwampMarkers && hasSwampMarkers         ? { type: 'swamp',      label: legend.swampMarkerLabel   } : null,
  ].filter(Boolean) as { type: string; label: string }[]

  if (items.length === 0) return null

  const fs = legend.fontSize
  const rowH = fs * 1.6
  const sampW = fs * 3
  const gapX = fs * 0.6
  const pad = fs * 0.6
  const colGap = pad
  const maxLabelLen = Math.max(...items.map(i => i.label.length))
  const colW = sampW + gapX + maxLabelLen * fs * 0.56

  const cols = Math.max(1, Math.min(legend.columns, items.length))
  const rows = Math.ceil(items.length / cols)

  const barH = fs * 1.2
  const barLabelH = fs * 1.1
  const barSectionH = showColorBar ? (pad + barH + barLabelH) : 0

  const minBarW = showColorBar ? 5 * fs * 3.2 : 0
  const boxW = Math.max(pad + cols * colW + (cols - 1) * colGap + pad, minBarW + 2 * pad)
  const boxH_items = pad + rows * rowH + pad
  const boxH = boxH_items + barSectionH
  const edgeGap = Math.max(4, (frame.borderEnabled ? frame.borderWidth * 2 : 0) + 3)

  return (
    <svg width={boxW} height={boxH} style={getElementPositionStyle(legend.position, frame, boxW, boxH, edgeGap)} overflow="visible">
      <rect x={0.5} y={0.5} width={boxW-1} height={boxH-1}
        fill={frame.marginColor} stroke={legend.color} strokeWidth={0.5} rx={1.5} />
      {items.map(({ type, label }, i) => {
        const col = Math.floor(i / rows)
        const row = i % rows
        const sx1 = pad + col * (colW + colGap)
        const sx2 = sx1 + sampW
        const midY = pad + row * rowH + rowH / 2

        let sample: JSX.Element
        if (type === 'minor') {
          sample = <line x1={sx1} y1={midY} x2={sx2} y2={midY}
            stroke={style.minorColor} strokeWidth={style.minorWidth} strokeLinecap="round" />
        } else if (type === 'major') {
          sample = <line x1={sx1} y1={midY} x2={sx2} y2={midY}
            stroke={style.majorColor} strokeWidth={style.majorWidth} strokeLinecap="round" />
        } else if (type === 'sea-level') {
          sample = <line x1={sx1} y1={midY} x2={sx2} y2={midY}
            stroke={style.seaLevelColor} strokeWidth={style.seaLevelWidth} strokeLinecap="round"
            strokeDasharray={style.seaLevelDash === 'dashed' ? '4 2' : style.seaLevelDash === 'dotted' ? '1 2' : undefined} />
        } else if (type === 'flag') {
          const h = rowH * 0.65, fx = sx1 + sampW/2 - h*0.2, fy = midY - h/2
          sample = (
            <g>
              <line x1={fx} y1={fy} x2={fx} y2={fy+h} stroke={style.labelColor} strokeWidth={1} />
              <polygon points={`${fx},${fy} ${fx+h*0.5},${fy+h*0.22} ${fx},${fy+h*0.43}`} fill={style.labelColor} />
            </g>
          )
        } else if (type === 'geo-anchor') {
          const cx_icon = sx1 + sampW / 2
          const r_icon = rowH * 0.3
          sample = (
            <g>
              <line x1={cx_icon - r_icon * 1.3} y1={midY} x2={cx_icon + r_icon * 1.3} y2={midY}
                stroke={legend.color} strokeWidth={0.8} />
              <line x1={cx_icon} y1={midY - r_icon * 1.3} x2={cx_icon} y2={midY + r_icon * 1.3}
                stroke={legend.color} strokeWidth={0.8} />
              <circle cx={cx_icon} cy={midY} r={r_icon} fill="none" stroke={legend.color} strokeWidth={0.8} />
            </g>
          )
        } else if (type === 'ruggedness') {
          const h = rowH * 0.65
          const fx = sx1 + sampW * 0.38
          const fy_top = midY - h * 0.55
          const fy_base = midY + h * 0.45
          const iconColor = ruggednessColorBySeverity ? TRI_COLORS[2] : legend.color
          sample = (
            <g>
              <line x1={fx} y1={fy_base} x2={fx} y2={fy_top} stroke={iconColor} strokeWidth={0.8} />
              <polyline
                points={`${fx},${fy_top} ${fx+h*0.18},${fy_top-h*0.2} ${fx+h*0.33},${fy_top-h*0.07} ${fx+h*0.48},${fy_top-h*0.26} ${fx+h*0.6},${fy_top-h*0.12}`}
                fill="none" stroke={iconColor} strokeWidth={0.7} strokeLinejoin="round" />
              <polyline
                points={`${fx},${fy_top} ${fx+h*0.18},${fy_top-h*0.06} ${fx+h*0.33},${fy_top+h*0.05} ${fx+h*0.48},${fy_top-h*0.1} ${fx+h*0.6},${fy_top+h*0.01}`}
                fill="none" stroke={iconColor} strokeWidth={0.7} strokeLinejoin="round" />
            </g>
          )
        } else if (type === 'swamp') {
          const h = rowH * 0.7
          const cx = sx1 + sampW / 2
          const base = midY + h * 0.3
          const color = swampMarkerDefaults.color
          const sw = 0.9
          sample = (
            <g>
              <line x1={cx} y1={base} x2={cx} y2={base-h} stroke={color} strokeWidth={sw} strokeLinecap="round" />
              <line x1={cx} y1={base} x2={cx-h*0.22} y2={base-h*0.88} stroke={color} strokeWidth={sw} strokeLinecap="round" />
              <line x1={cx} y1={base} x2={cx+h*0.22} y2={base-h*0.88} stroke={color} strokeWidth={sw} strokeLinecap="round" />
              <path d={`M ${cx} ${base} Q ${cx-h*0.52} ${base-h*0.62} ${cx-h*0.64} ${base-h*0.18}`}
                fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
              <path d={`M ${cx} ${base} Q ${cx+h*0.52} ${base-h*0.62} ${cx+h*0.64} ${base-h*0.18}`}
                fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />
            </g>
          )
        } else {
          const w = sampW * 0.6, hw = w * 0.28, hl = w * 0.3
          const ax1 = sx1 + (sampW-w)/2, ax2 = ax1 + w, ab = ax2 - hl
          sample = (
            <g>
              <line x1={ax1} y1={midY} x2={ab} y2={midY} stroke={style.labelColor} strokeWidth={1} />
              <polygon points={`${ax2},${midY} ${ab},${midY-hw} ${ab},${midY+hw}`} fill={style.labelColor} />
            </g>
          )
        }
        return (
          <g key={i}>
            {sample}
            <text x={sx2 + gapX} y={midY}
              fontSize={fs} fontFamily="serif" fill={legend.color} dominantBaseline="middle">
              {label}
            </text>
          </g>
        )
      })}

      {/* TRI severity color bar */}
      {showColorBar && (() => {
        const barY = boxH_items
        const barX = pad
        const barInnerW = boxW - 2 * pad
        const tierW = barInnerW / 5
        return (
          <g>
            <line x1={pad} y1={barY} x2={boxW - pad} y2={barY} stroke={legend.color} strokeWidth={0.3} strokeOpacity={0.4} />
            {TRI_COLORS.map((color, i) => (
              <rect key={i} x={barX + i * tierW} y={barY + pad * 0.5} width={tierW} height={barH}
                fill={color} />
            ))}
            {TRI_LABELS.map((label, i) => (
              <text key={i}
                x={barX + i * tierW + tierW / 2}
                y={barY + pad * 0.5 + barH + fs * 0.15}
                fontSize={fs * 0.75} fontFamily="sans-serif" fill={legend.color}
                textAnchor="middle" dominantBaseline="hanging">
                {label}
              </text>
            ))}
          </g>
        )
      })()}
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Measure bar overlay
// ---------------------------------------------------------------------------

function MeasureBarOverlay({
  measureBar, frame, calibration, heightmap, mapW, mapH,
}: {
  measureBar: MeasureBarConfig
  frame: FrameConfig
  calibration: ElevationCalibration
  heightmap: HeightmapInfo
  mapW: number
  mapH: number
}): JSX.Element | null {
  if (!calibration.mapWidth || calibration.mapWidth <= 0 || !calibration.unitType) return null

  const { marginLeft: ml, marginRight: mr, marginTop: mt, marginBottom: mb } = frame
  const outerW = mapW + ml + mr
  const outerH = mapH + mt + mb
  if (mapW <= 0 || mapH <= 0) return null

  const pixelsPerUnit = mapW / calibration.mapWidth
  const tickSpacing = measureBar.majorInterval * pixelsPerUnit
  if (tickSpacing < 2) return null

  const unitAbbr = calibration.unitType === 'feet' ? 'ft'
    : calibration.unitType === 'meters' ? 'm'
    : calibration.customAbbr || ''

  const metersPerUnit = calibration.unitType === 'feet' ? 0.3048
    : calibration.unitType === 'meters' ? 1
    : calibration.customRatio * (calibration.customBase === 'feet' ? 0.3048 : 1)
  const metersPerPixel = metersPerUnit * (calibration.mapWidth / mapW)

  const anchorX_eff = measureBar.anchorX ?? 0
  const anchorY_eff = measureBar.anchorY ?? (heightmap.height - 1)
  const anchorScreenX = ml + anchorX_eff * (mapW / heightmap.width)
  const anchorScreenY = mt + anchorY_eff * (mapH / heightmap.height)

  const R_m = measureBar.planetRadius * 1000
  const anchorLatRad = measureBar.anchorLat * Math.PI / 180
  const cosLat = Math.max(0.001, Math.cos(anchorLatRad))

  function geoLabelH(screenX: number): string {
    const dist_m = (screenX - anchorScreenX) * metersPerPixel
    if (!measureBar.horizontalAxisIsLat) {
      return toDMS(measureBar.anchorLon + (dist_m / (R_m * cosLat)) * (180 / Math.PI), false)
    } else {
      return toDMS(measureBar.anchorLat + (dist_m / R_m) * (180 / Math.PI), true)
    }
  }

  function geoLabelV(screenY: number): string {
    const dist_m = (anchorScreenY - screenY) * metersPerPixel
    if (!measureBar.horizontalAxisIsLat) {
      return toDMS(measureBar.anchorLat + (dist_m / R_m) * (180 / Math.PI), true)
    } else {
      return toDMS(measureBar.anchorLon + (dist_m / (R_m * cosLat)) * (180 / Math.PI), false)
    }
  }

  const { color, lineWidth: lw, tickLength: tl, minorTickLength: mtl, fontSize: fs } = measureBar
  const minorDiv = Math.max(1, Math.floor(measureBar.minorDivisions))
  const geo = measureBar.geoEnabled

  const els: JSX.Element[] = []
  let k = 0
  const K = () => k++

  const labelH = (x: number, baseY: number, dir: 1 | -1, dist: number) => {
    const distLabel = `${dist}${unitAbbr}`
    const geoLabel = geo ? geoLabelH(x) : null
    const db = dir > 0 ? 'hanging' : 'auto'
    els.push(
      <text key={K()} x={x} y={baseY} fontSize={fs} fontFamily="sans-serif" fill={color} textAnchor="middle" dominantBaseline={db}>
        {distLabel}
      </text>
    )
    if (geoLabel) {
      const y2 = dir > 0 ? baseY + fs + 2 : baseY - fs * 0.85 - 2
      els.push(
        <text key={K()} x={x} y={y2} fontSize={fs * 0.85} fontFamily="sans-serif" fill={color} textAnchor="middle" dominantBaseline={db}>
          {geoLabel}
        </text>
      )
    }
  }

  const labelV = (baseX: number, y: number, dir: 1 | -1, dist: number) => {
    const distLabel = `${dist}${unitAbbr}`
    const geoLabel = geo ? geoLabelV(y) : null
    const anchor = dir < 0 ? 'end' : 'start'
    if (!geoLabel) {
      els.push(
        <text key={K()} x={baseX} y={y} fontSize={fs} fontFamily="sans-serif" fill={color} textAnchor={anchor} dominantBaseline="middle">
          {distLabel}
        </text>
      )
    } else {
      els.push(
        <text key={K()} x={baseX} y={y - fs * 0.6} fontSize={fs} fontFamily="sans-serif" fill={color} textAnchor={anchor} dominantBaseline="auto">
          {distLabel}
        </text>,
        <text key={K()} x={baseX} y={y + fs * 0.5} fontSize={fs * 0.85} fontFamily="sans-serif" fill={color} textAnchor={anchor} dominantBaseline="hanging">
          {geoLabel}
        </text>
      )
    }
  }

  if (measureBar.showBottom) {
    const y0 = outerH - mb
    els.push(<line key={K()} x1={ml} y1={y0} x2={ml + mapW} y2={y0} stroke={color} strokeWidth={lw} />)
    for (let i = 0; i * tickSpacing <= mapW + 0.5; i++) {
      const x = Math.min(ml + i * tickSpacing, ml + mapW)
      els.push(<line key={K()} x1={x} y1={y0} x2={x} y2={y0 + tl} stroke={color} strokeWidth={lw} strokeLinecap="square" />)
      labelH(x, y0 + tl + 2, 1, i * measureBar.majorInterval)
      if (minorDiv > 1) for (let j = 1; j < minorDiv; j++) {
        const mx = ml + i * tickSpacing + j * tickSpacing / minorDiv
        if (mx > ml + mapW) break
        els.push(<line key={K()} x1={mx} y1={y0} x2={mx} y2={y0 + mtl} stroke={color} strokeWidth={lw * 0.7} strokeLinecap="square" />)
      }
    }
  }

  if (measureBar.showTop) {
    const y0 = mt
    els.push(<line key={K()} x1={ml} y1={y0} x2={ml + mapW} y2={y0} stroke={color} strokeWidth={lw} />)
    for (let i = 0; i * tickSpacing <= mapW + 0.5; i++) {
      const x = Math.min(ml + i * tickSpacing, ml + mapW)
      els.push(<line key={K()} x1={x} y1={y0} x2={x} y2={y0 - tl} stroke={color} strokeWidth={lw} strokeLinecap="square" />)
      labelH(x, y0 - tl - 2, -1, i * measureBar.majorInterval)
      if (minorDiv > 1) for (let j = 1; j < minorDiv; j++) {
        const mx = ml + i * tickSpacing + j * tickSpacing / minorDiv
        if (mx > ml + mapW) break
        els.push(<line key={K()} x1={mx} y1={y0} x2={mx} y2={y0 - mtl} stroke={color} strokeWidth={lw * 0.7} strokeLinecap="square" />)
      }
    }
  }

  if (measureBar.showLeft) {
    const x0 = ml
    els.push(<line key={K()} x1={x0} y1={mt} x2={x0} y2={mt + mapH} stroke={color} strokeWidth={lw} />)
    for (let i = 0; i * tickSpacing <= mapH + 0.5; i++) {
      const y = Math.max((outerH - mb) - i * tickSpacing, mt)
      els.push(<line key={K()} x1={x0} y1={y} x2={x0 - tl} y2={y} stroke={color} strokeWidth={lw} strokeLinecap="square" />)
      labelV(x0 - tl - 2, y, -1, i * measureBar.majorInterval)
      if (minorDiv > 1) for (let j = 1; j < minorDiv; j++) {
        const my = (outerH - mb) - (i * tickSpacing + j * tickSpacing / minorDiv)
        if (my < mt) break
        els.push(<line key={K()} x1={x0} y1={my} x2={x0 - mtl} y2={my} stroke={color} strokeWidth={lw * 0.7} strokeLinecap="square" />)
      }
    }
  }

  if (measureBar.showRight) {
    const x0 = outerW - mr
    els.push(<line key={K()} x1={x0} y1={mt} x2={x0} y2={mt + mapH} stroke={color} strokeWidth={lw} />)
    for (let i = 0; i * tickSpacing <= mapH + 0.5; i++) {
      const y = Math.max((outerH - mb) - i * tickSpacing, mt)
      els.push(<line key={K()} x1={x0} y1={y} x2={x0 + tl} y2={y} stroke={color} strokeWidth={lw} strokeLinecap="square" />)
      labelV(x0 + tl + 2, y, 1, i * measureBar.majorInterval)
      if (minorDiv > 1) for (let j = 1; j < minorDiv; j++) {
        const my = (outerH - mb) - (i * tickSpacing + j * tickSpacing / minorDiv)
        if (my < mt) break
        els.push(<line key={K()} x1={x0} y1={my} x2={x0 + mtl} y2={my} stroke={color} strokeWidth={lw * 0.7} strokeLinecap="square" />)
      }
    }
  }

  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible', width: '100%', height: '100%' }}
      viewBox={`0 0 ${outerW} ${outerH}`}
    >
      {els}
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
  const ruggednessFlags = useStore((s) => s.ruggednessFlags)
  const addRuggednessFlag = useStore((s) => s.addRuggednessFlag)
  const updateRuggednessFlag = useStore((s) => s.updateRuggednessFlag)
  const removeRuggednessFlag = useStore((s) => s.removeRuggednessFlag)
  const ruggednessColorBySeverity = useStore((s) => s.ruggednessColorBySeverity)
  const setMapTool = useStore((s) => s.setMapTool)
  const measureBar = useStore((s) => s.measureBar)
  const updateMeasureBar = useStore((s) => s.updateMeasureBar)
  const setMapDisplaySize = useStore((s) => s.setMapDisplaySize)
  const swampMarkers = useStore((s) => s.swampMarkers)
  const addSwampMarker = useStore((s) => s.addSwampMarker)
  const updateSwampMarker = useStore((s) => s.updateSwampMarker)
  const removeSwampMarker = useStore((s) => s.removeSwampMarker)
  const swampMarkerDefaults = useStore((s) => s.swampMarkerDefaults)
  const elevationFlagDefaults = useStore((s) => s.elevationFlagDefaults)
  const slopeArrowDefaults = useStore((s) => s.slopeArrowDefaults)
  const ruggednessFlagDefaults = useStore((s) => s.ruggednessFlagDefaults)

  // Track inner map area dimensions for measure bar overlay.
  // We observe the inner map div (not the outer composition div) so that ResizeObserver
  // fires on image-load / zoom changes. Frame margins are added inside MeasureBarOverlay
  // from live React state, avoiding stale values when only padding changes.
  const innerMapRef = useRef<HTMLDivElement>(null)
  const [innerMapSize, setInnerMapSize] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const div = innerMapRef.current
    if (!div) return
    const update = () => {
      const size = { w: div.clientWidth, h: div.clientHeight }
      setInnerMapSize(size)
      setMapDisplaySize(size)
    }
    update()
    const obs = new ResizeObserver(update)
    obs.observe(div)
    return () => { obs.disconnect(); setMapDisplaySize(null) }
  }, [])

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

  // Compute normalized TRI (Riley et al. 1999) at any SVG coordinate (uses refs — always current)
  const computeTriAt = useCallback((svgX: number, svgY: number): number | null => {
    const hm = heightmapRef.current
    if (!hm) return null
    const px = Math.min(Math.max(Math.round(svgX), 0), hm.width - 1)
    const py = Math.min(Math.max(Math.round(svgY), 0), hm.height - 1)
    const center = hm.data[py * hm.width + px]
    let sumSq = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = Math.min(Math.max(px + dx, 0), hm.width - 1)
        const ny = Math.min(Math.max(py + dy, 0), hm.height - 1)
        const diff = center - hm.data[ny * hm.width + nx]
        sumSq += diff * diff
      }
    }
    return Math.sqrt(sumSq)
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
        else if (type === 'slope-arrow') removeSlopeArrow(id)
        else if (type === 'ruggedness-flag') removeRuggednessFlag(id)
        else if (type === 'swamp-marker') removeSwampMarker(id)
        setSelectedItem(null)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [setMapTool, removeElevationFlag, removeSlopeArrow, removeRuggednessFlag, removeSwampMarker])

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
      } else if (dragRef.current.type === 'slope-arrow') {
        const slope = computeSlopeAt(pt.x, pt.y)
        setDragPos({ x: pt.x, y: pt.y, angleDeg: slope?.angleDeg ?? 0, slopeDeg: slope?.slopeDeg ?? 0 })
      } else if (dragRef.current.type === 'ruggedness-flag') {
        const triNorm = computeTriAt(pt.x, pt.y) ?? 0
        setDragPos({ x: pt.x, y: pt.y, triNorm })
      } else {
        setDragPos({ x: pt.x, y: pt.y })
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
          } else if (type === 'slope-arrow') {
            const slope = computeSlopeAt(pt.x, pt.y)
            if (slope) updateSlopeArrow(itemId, { x: pt.x, y: pt.y, ...slope })
          } else if (type === 'ruggedness-flag') {
            const triNorm = computeTriAt(pt.x, pt.y) ?? 0
            updateRuggednessFlag(itemId, { x: pt.x, y: pt.y, triNorm })
          } else {
            updateSwampMarker(itemId, { x: pt.x, y: pt.y })
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
  }, [getSvgPoint, computeElevationAt, computeSlopeAt, computeTriAt, updateElevationFlag, updateSlopeArrow, updateRuggednessFlag, updateSwampMarker])

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
    } else if (mapTool === 'measure-anchor') {
      setHoverPos({ x: pt.x, y: pt.y })
    } else if (mapTool === 'ruggedness-flag') {
      const triNorm = computeTriAt(pt.x, pt.y)
      setHoverPos(triNorm !== null ? { x: pt.x, y: pt.y, triNorm } : null)
    } else if (mapTool === 'swamp-marker') {
      setHoverPos({ x: pt.x, y: pt.y })
    }
  }

  function handleSvgMouseLeave() {
    setHoverPos(null)
  }

  function handleItemMouseDown(e: React.MouseEvent, type: 'flag' | 'slope-arrow' | 'ruggedness-flag' | 'swamp-marker', itemId: string) {
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
        addElevationFlag({ id: crypto.randomUUID(), x: pt.x, y: pt.y, elevation: elev,
          boldness: elevationFlagDefaults.boldness, opacity: elevationFlagDefaults.opacity } as ElevationFlag)
      }
    } else if (mapTool === 'slope-arrow') {
      const slope = computeSlopeAt(pt.x, pt.y)
      if (slope) {
        addSlopeArrow({ id: crypto.randomUUID(), x: pt.x, y: pt.y, ...slope,
          boldness: slopeArrowDefaults.boldness, opacity: slopeArrowDefaults.opacity } as SlopeArrow)
      }
    } else if (mapTool === 'measure-anchor') {
      updateMeasureBar({ anchorX: Math.round(pt.x), anchorY: Math.round(pt.y) })
    } else if (mapTool === 'ruggedness-flag') {
      const triNorm = computeTriAt(pt.x, pt.y)
      if (triNorm !== null) {
        addRuggednessFlag({ id: crypto.randomUUID(), x: pt.x, y: pt.y, triNorm,
          boldness: ruggednessFlagDefaults.boldness, opacity: ruggednessFlagDefaults.opacity } as RuggednessFlag)
      }
    } else if (mapTool === 'swamp-marker') {
      const sizeFactor = 0.75 + Math.random() * 0.5
      addSwampMarker({ id: crypto.randomUUID(), x: pt.x, y: pt.y, sizeFactor,
        boldness: swampMarkerDefaults.boldness, opacity: swampMarkerDefaults.opacity, color: swampMarkerDefaults.color })
    }
  }

  const mapZoom = useStore((s) => s.mapZoom)
  const setMapZoom = useStore((s) => s.setMapZoom)
  const overlayOnly = useStore((s) => s.overlayOnly)
  const overlayBrightness = useStore((s) => s.overlayBrightness)
  const frame = useStore((s) => s.frame)
  const title = useStore((s) => s.title)
  const compass = useStore((s) => s.compass)
  const legend = useStore((s) => s.legend)

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

  const toolActive = mapTool === 'elevation-flag' || mapTool === 'slope-arrow' || mapTool === 'measure-anchor' || mapTool === 'ruggedness-flag' || mapTool === 'swamp-marker'
  const flagSvgInteractive = toolActive || elevationFlags.length > 0 || slopeArrows.length > 0 || ruggednessFlags.length > 0 || swampMarkers.length > 0

  // Pan-drag and wheel-zoom for default (no-tool) mode
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const mapZoomRef = useRef(mapZoom)
  mapZoomRef.current = mapZoom
  const panRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)
  const [isPanning, setIsPanning] = useState(false)

  useEffect(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const v = 50 * Math.log2(mapZoomRef.current / 100)
      const step = e.deltaY > 0 ? -5 : 5
      const newV = Math.max(-100, Math.min(100, v + step))
      setMapZoom(Math.round(100 * Math.pow(2, newV / 50)))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [setMapZoom])

  const canPan = mapTool === 'none' && !!(baseImageUrl || heightmap)

  function bw(base: number, boldness?: 1 | 2 | 3): number {
    return base * (boldness === 1 ? 0.6 : boldness === 3 ? 1.8 : 1.0)
  }

  function handleScrollMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!canPan || e.button !== 0) return
    const el = scrollContainerRef.current
    if (!el) return
    panRef.current = { startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop }
    setIsPanning(true)
    e.preventDefault()
  }

  function handleScrollMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!panRef.current) return
    const el = scrollContainerRef.current
    if (!el) return
    el.scrollLeft = panRef.current.scrollLeft - (e.clientX - panRef.current.startX)
    el.scrollTop = panRef.current.scrollTop - (e.clientY - panRef.current.startY)
  }

  function handleScrollMouseUp() {
    panRef.current = null
    setIsPanning(false)
  }

  return (
    <div
      ref={scrollContainerRef}
      style={{
        position: 'relative', width: '100%', flex: 1, minHeight: 0, overflow: 'auto',
        cursor: canPan ? (isPanning ? 'grabbing' : 'grab') : undefined,
        userSelect: isPanning ? 'none' : undefined,
      }}
      onMouseDown={handleScrollMouseDown}
      onMouseMove={handleScrollMouseMove}
      onMouseUp={handleScrollMouseUp}
      onMouseLeave={handleScrollMouseUp}
    >
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

      {/* Title — positioned in the chosen margin area */}
      {frame.enabled && title.enabled && title.text.trim() && (() => {
        const edgeGap = 4
        const isLeft = title.position.startsWith('left-')
        const isRight = title.position.startsWith('right-')
        const rotation = isLeft ? 'rotate(-90deg)' : isRight ? 'rotate(90deg)' : undefined
        const textStyle: React.CSSProperties = {
          color: title.color, fontFamily: title.font, fontSize: title.size,
          fontWeight: title.bold ? 'bold' : 'normal', fontStyle: title.italic ? 'italic' : 'normal',
          whiteSpace: 'nowrap', lineHeight: 1,
          ...(rotation ? { transform: rotation } : {}),
        }
        return (
          <div style={getTitleWrapperStyle(title.position, frame, edgeGap)}>
            <div style={textStyle}>{title.text}</div>
          </div>
        )
      })()}

      {/* Inner map area — position relative so SVG overlays stack correctly */}
      <div ref={innerMapRef} style={{
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
            cursor: toolActive ? 'crosshair' : 'inherit',
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
            const strokeW = bw(isSelected ? 2 : 1.5, flag.boldness)

            return (
              <g
                key={flag.id}
                opacity={flag.opacity ?? 1}
                onMouseDown={(e) => handleItemMouseDown(e, 'flag', flag.id)}
                style={{ cursor: isSelected ? 'grab' : 'pointer' }}
              >
                <line
                  x1={fx} y1={fy}
                  x2={fx} y2={fy - s}
                  stroke={flagColor}
                  strokeWidth={strokeW}
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
            const strokeW = bw(isSelected ? 2 : 1.5, arrow.boldness)

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
                opacity={arrow.opacity ?? 1}
                onMouseDown={(e) => handleItemMouseDown(e, 'slope-arrow', arrow.id)}
                style={{ cursor: isSelected ? 'grab' : 'pointer' }}
              >
                {/* Shaft */}
                <line
                  x1={tailX} y1={tailY}
                  x2={headBaseX} y2={headBaseY}
                  stroke={arrowColor}
                  strokeWidth={strokeW}
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
          {/* Ruggedness flags */}
          {ruggednessFlags.map((flag) => {
            const isDragging = dragPos !== null && dragRef.current?.itemId === flag.id && dragRef.current.type === 'ruggedness-flag'
            const fx = isDragging ? dragPos!.x : flag.x
            const fy = isDragging ? dragPos!.y : flag.y
            const displayTri = isDragging ? (dragPos!.triNorm ?? flag.triNorm) : flag.triNorm
            const isSelected = selectedItem?.type === 'ruggedness-flag' && selectedItem.id === flag.id
            const s = labelFontSize
            const severity = getTriSeverity(displayTri)
            const flagColor = ruggednessColorBySeverity ? TRI_COLORS[severity] : style.labelColor
            const strokeW = bw(isSelected ? 2 : 1.5, flag.boldness)

            const triDisplay = (elevationCalibration.realMin !== null && elevationCalibration.realMax !== null)
              ? `${Math.round(displayTri * Math.abs(elevationCalibration.realMax - elevationCalibration.realMin) * 10) / 10}${
                  elevationCalibration.unitType === 'feet' ? 'ft'
                  : elevationCalibration.unitType === 'meters' ? 'm'
                  : elevationCalibration.customAbbr || ''
                }`
              : displayTri.toFixed(3)

            return (
              <g
                key={flag.id}
                opacity={flag.opacity ?? 1}
                onMouseDown={(e) => handleItemMouseDown(e, 'ruggedness-flag', flag.id)}
                style={{ cursor: isSelected ? 'grab' : 'pointer' }}
              >
                {/* Pole */}
                <line x1={fx} y1={fy} x2={fx} y2={fy - s}
                  stroke={flagColor} strokeWidth={strokeW} vectorEffect="non-scaling-stroke" />
                {/* Upper jagged ridge */}
                <polyline
                  points={`${fx},${fy-s} ${fx+s*0.2},${fy-s-s*0.22} ${fx+s*0.36},${fy-s-s*0.07} ${fx+s*0.52},${fy-s-s*0.28} ${fx+s*0.65},${fy-s-s*0.13}`}
                  fill="none" stroke={flagColor} strokeWidth={bw(isSelected ? 1.5 : 1, flag.boldness)}
                  strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                {/* Lower jagged ridge */}
                <polyline
                  points={`${fx},${fy-s} ${fx+s*0.2},${fy-s-s*0.06} ${fx+s*0.36},${fy-s+s*0.05} ${fx+s*0.52},${fy-s-s*0.1} ${fx+s*0.65},${fy-s+s*0.01}`}
                  fill="none" stroke={flagColor} strokeWidth={bw(isSelected ? 1.5 : 1, flag.boldness)}
                  strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <text x={fx + s * 0.7} y={fy - s * 0.55}
                  fontSize={labelFontSize} fontFamily={style.labelFont}
                  fontWeight={style.labelBold ? 'bold' : 'normal'}
                  fontStyle={style.labelItalic ? 'italic' : 'normal'}
                  fill={style.labelColor} dominantBaseline="middle"
                >{triDisplay}</text>
                {isSelected && (
                  <circle cx={fx} cy={fy} r={s * 0.12}
                    fill="none" stroke={flagColor} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                )}
              </g>
            )
          })}

          {/* Swamp markers */}
          {swampMarkers.map((marker) => {
            const isDragging = dragPos !== null && dragRef.current?.itemId === marker.id && dragRef.current.type === 'swamp-marker'
            const fx = isDragging ? dragPos!.x : marker.x
            const fy = isDragging ? dragPos!.y : marker.y
            const isSelected = selectedItem?.type === 'swamp-marker' && selectedItem.id === marker.id
            const s = labelFontSize * marker.sizeFactor
            const strokeW = bw(isSelected ? 2 : 1.5, marker.boldness)
            const color = marker.color
            return (
              <g key={marker.id} opacity={marker.opacity}
                onMouseDown={(e) => handleItemMouseDown(e, 'swamp-marker', marker.id)}
                style={{ cursor: isSelected ? 'grab' : 'pointer' }}>
                {/* Center upright */}
                <line x1={fx} y1={fy} x2={fx} y2={fy-s} stroke={color} strokeWidth={strokeW} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {/* Left-center upright */}
                <line x1={fx} y1={fy} x2={fx-s*0.22} y2={fy-s*0.88} stroke={color} strokeWidth={strokeW} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {/* Right-center upright */}
                <line x1={fx} y1={fy} x2={fx+s*0.22} y2={fy-s*0.88} stroke={color} strokeWidth={strokeW} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {/* Left bent shoot — curves outward and droops */}
                <path d={`M ${fx} ${fy} Q ${fx-s*0.52} ${fy-s*0.62} ${fx-s*0.64} ${fy-s*0.18}`}
                  fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {/* Right bent shoot */}
                <path d={`M ${fx} ${fy} Q ${fx+s*0.52} ${fy-s*0.62} ${fx+s*0.64} ${fy-s*0.18}`}
                  fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                {isSelected && (
                  <circle cx={fx} cy={fy} r={s * 0.12}
                    fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                )}
              </g>
            )
          })}

          {/* Measure anchor crosshair */}
          {(() => {
            const showAnchor = mapTool === 'measure-anchor'
              || (measureBar.enabled && measureBar.geoEnabled && measureBar.anchorX !== null)
            if (!showAnchor) return null
            const ax = measureBar.anchorX ?? 0
            const ay = measureBar.anchorY ?? (heightmap!.height - 1)
            const r = labelFontSize * 0.8
            const ext = r * 2.5
            return (
              <g style={{ pointerEvents: 'none' }}>
                <line x1={ax - ext} y1={ay} x2={ax + ext} y2={ay} stroke={measureBar.color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <line x1={ax} y1={ay - ext} x2={ax} y2={ay + ext} stroke={measureBar.color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                <circle cx={ax} cy={ay} r={r} fill="none" stroke={measureBar.color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
              </g>
            )
          })()}

          {/* Hover preview — live readout while tool is active, no drag in progress */}
          {toolActive && hoverPos && !dragPos && (() => {
            const s = labelFontSize
            if (mapTool === 'measure-anchor') {
              const r = s * 0.8
              const ext = r * 2.5
              return (
                <g opacity={0.6} style={{ pointerEvents: 'none' }}>
                  <line x1={hoverPos.x - ext} y1={hoverPos.y} x2={hoverPos.x + ext} y2={hoverPos.y} stroke={measureBar.color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <line x1={hoverPos.x} y1={hoverPos.y - ext} x2={hoverPos.x} y2={hoverPos.y + ext} stroke={measureBar.color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  <circle cx={hoverPos.x} cy={hoverPos.y} r={r} fill="none" stroke={measureBar.color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
                </g>
              )
            }
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
            if (mapTool === 'ruggedness-flag' && hoverPos.triNorm !== undefined) {
              const { triNorm } = hoverPos
              const severity = getTriSeverity(triNorm)
              const hoverColor = ruggednessColorBySeverity ? TRI_COLORS[severity] : style.labelColor
              const triDisplay = (elevationCalibration.realMin !== null && elevationCalibration.realMax !== null)
                ? `${Math.round(triNorm * Math.abs(elevationCalibration.realMax - elevationCalibration.realMin) * 10) / 10}${
                    elevationCalibration.unitType === 'feet' ? 'ft'
                    : elevationCalibration.unitType === 'meters' ? 'm'
                    : elevationCalibration.customAbbr || ''
                  }`
                : triNorm.toFixed(3)
              return (
                <g opacity={0.75} style={{ pointerEvents: 'none' }}>
                  <line x1={hoverPos.x} y1={hoverPos.y} x2={hoverPos.x} y2={hoverPos.y - s}
                    stroke={hoverColor} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  <polyline
                    points={`${hoverPos.x},${hoverPos.y-s} ${hoverPos.x+s*0.2},${hoverPos.y-s-s*0.22} ${hoverPos.x+s*0.36},${hoverPos.y-s-s*0.07} ${hoverPos.x+s*0.52},${hoverPos.y-s-s*0.28} ${hoverPos.x+s*0.65},${hoverPos.y-s-s*0.13}`}
                    fill="none" stroke={hoverColor} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <polyline
                    points={`${hoverPos.x},${hoverPos.y-s} ${hoverPos.x+s*0.2},${hoverPos.y-s-s*0.06} ${hoverPos.x+s*0.36},${hoverPos.y-s+s*0.05} ${hoverPos.x+s*0.52},${hoverPos.y-s-s*0.1} ${hoverPos.x+s*0.65},${hoverPos.y-s+s*0.01}`}
                    fill="none" stroke={hoverColor} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <text x={hoverPos.x + s * 0.7} y={hoverPos.y - s * 0.55}
                    fontSize={s} fontFamily={style.labelFont}
                    fill={style.labelColor} dominantBaseline="middle"
                  >{triDisplay}</text>
                </g>
              )
            }
            if (mapTool === 'swamp-marker') {
              const s = labelFontSize
              const color = swampMarkerDefaults.color
              const strokeW = bw(1.5, swampMarkerDefaults.boldness)
              return (
                <g opacity={0.7} style={{ pointerEvents: 'none' }}>
                  <line x1={hoverPos.x} y1={hoverPos.y} x2={hoverPos.x} y2={hoverPos.y-s} stroke={color} strokeWidth={strokeW} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <line x1={hoverPos.x} y1={hoverPos.y} x2={hoverPos.x-s*0.22} y2={hoverPos.y-s*0.88} stroke={color} strokeWidth={strokeW} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <line x1={hoverPos.x} y1={hoverPos.y} x2={hoverPos.x+s*0.22} y2={hoverPos.y-s*0.88} stroke={color} strokeWidth={strokeW} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path d={`M ${hoverPos.x} ${hoverPos.y} Q ${hoverPos.x-s*0.52} ${hoverPos.y-s*0.62} ${hoverPos.x-s*0.64} ${hoverPos.y-s*0.18}`}
                    fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  <path d={`M ${hoverPos.x} ${hoverPos.y} Q ${hoverPos.x+s*0.52} ${hoverPos.y-s*0.62} ${hoverPos.x+s*0.64} ${hoverPos.y-s*0.18}`}
                    fill="none" stroke={color} strokeWidth={strokeW} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </g>
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

      {/* Legend overlay — positioned in margin corner */}
      {frame.enabled && legend.enabled && heightmap && (
        <LegendOverlay
          legend={legend}
          frame={frame}
          style={style}
          hasElevationFlags={elevationFlags.length > 0}
          hasSlopeArrows={slopeArrows.length > 0}
          measureBar={measureBar}
          hasRuggednessFlags={ruggednessFlags.length > 0}
          ruggednessColorBySeverity={ruggednessColorBySeverity}
          hasSwampMarkers={swampMarkers.length > 0}
          swampMarkerDefaults={swampMarkerDefaults}
        />
      )}

      {/* Measure bar overlay — ticks along map edges into margin area */}
      {frame.enabled && measureBar.enabled && heightmap && innerMapSize && (
        <MeasureBarOverlay
          measureBar={measureBar}
          frame={frame}
          calibration={elevationCalibration}
          heightmap={heightmap}
          mapW={innerMapSize.w}
          mapH={innerMapSize.h}
        />
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
