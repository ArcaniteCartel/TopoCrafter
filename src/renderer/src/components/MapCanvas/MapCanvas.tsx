import { useCallback, useEffect, useRef, useState } from 'react'
import { Center, Text, Stack, Loader, Overlay, Modal, Button, Group } from '@mantine/core'
import type { ContourMultiPolygon } from 'd3-contour'
import { useStore } from '../../store/useStore'
import { generateContours, contourToSvgPath } from '../../utils/contour'
import type { ContourSet } from '../../utils/contour'
import type { ElevationFlag, SlopeArrow, RuggednessFlag, SwampMarker, Road, BuildingEntry, BuildingShape, PoiEntry, PoiNewMarkerState, CustomMarkerDef, MarkerPrimitiveId, BuiltinMarkerTypeId, FrameConfig, CompassConfig, LegendConfig, ContourStyle, FramePosition, MeasureBarConfig, ElevationCalibration, HeightmapInfo, GridConfig, CurvedLabel, SelectableItemType } from '../../types'
import { defaultCurvedLabelStyle, calToMeters, niceBarDistance } from '../../types'
import { BUILTIN_MARKER_SPECS } from '../../types'
import { useGlobalStore } from '../../store/useGlobalStore'
import { BUILDING_CATALOG } from '../../data/buildings'
import { TRI_THRESHOLDS, TRI_COLORS, TRI_LABELS, getTriSeverity, triRangeLabel } from '../../types'
import { catmullRomPath, catmullRomOffsetPath, stepsHatchPath } from '../../utils/spline'
import { drawGridOnCanvas } from '../../utils/grid'

function buildingPath(shape: BuildingShape, cx: number, cy: number, w: number, d: number): string {
  const hw = w / 2, hd = d / 2
  switch (shape) {
    case 'rectangle':
      return `M ${cx-hw},${cy-hd} L ${cx+hw},${cy-hd} L ${cx+hw},${cy+hd} L ${cx-hw},${cy+hd} Z`
    case 'circle':
      return `M ${cx-hw},${cy} A ${hw},${hd} 0 1,0 ${cx+hw},${cy} A ${hw},${hd} 0 1,0 ${cx-hw},${cy} Z`
    case 'bow-sided': {
      const bow = hw * 1.14
      return `M ${cx-hw},${cy-hd} Q ${cx-bow},${cy} ${cx-hw},${cy+hd} L ${cx+hw},${cy+hd} Q ${cx+bow},${cy} ${cx+hw},${cy-hd} Z`
    }
    case 'apsidal':
      return `M ${cx-hw},${cy+hd} L ${cx+hw},${cy+hd} L ${cx+hw},${cy-hd+hw} A ${hw},${hw} 0 0,0 ${cx-hw},${cy-hd+hw} Z`
    case 'courtyard': {
      const iw2 = w * 0.3, id2 = d * 0.3
      return `M ${cx-hw},${cy-hd} L ${cx+hw},${cy-hd} L ${cx+hw},${cy+hd} L ${cx-hw},${cy+hd} Z ` +
             `M ${cx-iw2},${cy-id2} L ${cx-iw2},${cy+id2} L ${cx+iw2},${cy+id2} L ${cx+iw2},${cy-id2} Z`
    }
    case 'L-shape':
      return `M ${cx-hw},${cy-hd} L ${cx},${cy-hd} L ${cx},${cy} L ${cx+hw},${cy} L ${cx+hw},${cy+hd} L ${cx-hw},${cy+hd} Z`
    case 'U-shape': {
      const nw = hw * 0.5
      return `M ${cx-hw},${cy-hd} L ${cx+hw},${cy-hd} L ${cx+hw},${cy+hd} ` +
             `L ${cx+nw},${cy+hd} L ${cx+nw},${cy} L ${cx-nw},${cy} L ${cx-nw},${cy+hd} ` +
             `L ${cx-hw},${cy+hd} Z`
    }
    case 'octagon': {
      const cut = 0.2929
      const xc = hw * cut, yc = hd * cut
      return `M ${cx-hw},${cy-hd+yc} L ${cx-hw+xc},${cy-hd} L ${cx+hw-xc},${cy-hd} ` +
             `L ${cx+hw},${cy-hd+yc} L ${cx+hw},${cy+hd-yc} L ${cx+hw-xc},${cy+hd} ` +
             `L ${cx-hw+xc},${cy+hd} L ${cx-hw},${cy+hd-yc} Z`
    }
  }
}

// ── Builtin POI symbols ────────────────────────────────────────────────────

function PoiMineSymbol({ cx, cy, sizePx, color, sw }: { cx: number; cy: number; sizePx: number; color: string; sw: number }): JSX.Element {
  const s = sizePx / 2
  const c = Math.SQRT2 / 2
  const t = s * 0.32
  const ax1 = cx - s*c, ay1 = cy - s*c, ax2 = cx + s*c, ay2 = cy + s*c
  const bx1 = cx - s*c, by1 = cy + s*c, bx2 = cx + s*c, by2 = cy - s*c
  const t1x1 = ax1 - t*c, t1y1 = ay1 + t*c, t1x2 = ax1 + t*c, t1y2 = ay1 - t*c
  const t2x1 = ax2 - t*c, t2y1 = ay2 + t*c, t2x2 = ax2 + t*c, t2y2 = ay2 - t*c
  const t3x1 = bx1 - t*c, t3y1 = by1 - t*c, t3x2 = bx1 + t*c, t3y2 = by1 + t*c
  const t4x1 = bx2 - t*c, t4y1 = by2 - t*c, t4x2 = bx2 + t*c, t4y2 = by2 + t*c
  return (
    <g stroke={color} strokeWidth={sw} strokeLinecap="round" fill="none" style={{ pointerEvents: 'none' }}>
      <line x1={ax1} y1={ay1} x2={ax2} y2={ay2} />
      <line x1={bx1} y1={by1} x2={bx2} y2={by2} />
      <line x1={t1x1} y1={t1y1} x2={t1x2} y2={t1y2} />
      <line x1={t2x1} y1={t2y1} x2={t2x2} y2={t2y2} />
      <line x1={t3x1} y1={t3y1} x2={t3x2} y2={t3y2} />
      <line x1={t4x1} y1={t4y1} x2={t4x2} y2={t4y2} />
    </g>
  )
}

function PoiBridgeSymbol({ cx, cy, lengthPx, sepPx, sw, color, rotation }: { cx: number; cy: number; lengthPx: number; sepPx: number; sw: number; color: string; rotation: number }): JSX.Element {
  const hl = lengthPx / 2, hs = sepPx / 2
  return (
    <g transform={`rotate(${rotation},${cx},${cy})`} stroke={color} strokeWidth={sw} strokeLinecap="square" fill="none" style={{ pointerEvents: 'none' }}>
      <line x1={cx - hl} y1={cy - hs} x2={cx + hl} y2={cy - hs} />
      <line x1={cx - hl} y1={cy + hs} x2={cx + hl} y2={cy + hs} />
    </g>
  )
}

// ── Primitive symbols ──────────────────────────────────────────────────────

function PrimSymbol({ cx, cy, s, color, sw, id }: { cx: number; cy: number; s: number; color: string; sw: number; id: MarkerPrimitiveId }): JSX.Element {
  const g: React.SVGProps<SVGGElement> = { stroke: color, strokeWidth: sw, fill: 'none', strokeLinecap: 'round', style: { pointerEvents: 'none' } }
  const r = s * 0.5
  switch (id) {
    case 'cross-plus':
      return <g {...g}><line x1={cx} y1={cy-s} x2={cx} y2={cy+s} /><line x1={cx-s} y1={cy} x2={cx+s} y2={cy} /></g>
    case 'cross-x': {
      const d = s * Math.SQRT2 / 2
      return <g {...g}><line x1={cx-d} y1={cy-d} x2={cx+d} y2={cy+d} /><line x1={cx-d} y1={cy+d} x2={cx+d} y2={cy-d} /></g>
    }
    case 'cross-star': {
      const d = s * Math.SQRT2 / 2
      return <g {...g}>
        <line x1={cx} y1={cy-s} x2={cx} y2={cy+s} /><line x1={cx-s} y1={cy} x2={cx+s} y2={cy} />
        <line x1={cx-d} y1={cy-d} x2={cx+d} y2={cy+d} /><line x1={cx-d} y1={cy+d} x2={cx+d} y2={cy-d} />
      </g>
    }
    case 'circle-tri-open':
      return <g {...g}>
        <circle cx={cx} cy={cy} r={r} />
        <polygon points={`${cx},${cy-r*0.65} ${cx-r*0.55},${cy+r*0.42} ${cx+r*0.55},${cy+r*0.42}`} />
      </g>
    case 'circle-tri-filled':
      return <g {...g}>
        <circle cx={cx} cy={cy} r={r} />
        <polygon points={`${cx},${cy-r*0.65} ${cx-r*0.55},${cy+r*0.42} ${cx+r*0.55},${cy+r*0.42}`} fill={color} />
      </g>
    case 'circle-crossbar':
      return <g {...g}><circle cx={cx} cy={cy} r={r} /><line x1={cx-r} y1={cy} x2={cx+r} y2={cy} /></g>
    case 'circle-hatched': {
      const clipId = `hatch-${cx.toFixed(0)}-${cy.toFixed(0)}`
      return <g style={{ pointerEvents: 'none' }}>
        <defs><clipPath id={clipId}><circle cx={cx} cy={cy} r={r} /></clipPath></defs>
        <circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={sw} fill="none" />
        <g clipPath={`url(#${clipId})`}>
          {[-1, -0.33, 0.33, 1].map((t, i) => {
            const ox = t * r * 0.7
            return <line key={i} x1={cx+ox-r} y1={cy+r} x2={cx+ox+r} y2={cy-r} stroke={color} strokeWidth={sw * 0.7} />
          })}
        </g>
      </g>
    }
    case 'mountains':
      return <g {...g} strokeLinejoin="round">
        <polyline points={`${cx-s*0.85},${cy+s*0.5} ${cx-s*0.2},${cy-s*0.5} ${cx+s*0.15},${cy+s*0.1}`} />
        <polyline points={`${cx-s*0.1},${cy+s*0.1} ${cx+s*0.35},${cy-s*0.32} ${cx+s*0.85},${cy+s*0.5}`} />
      </g>
    case 'pin': {
      const pr = s * 0.45
      return <g style={{ pointerEvents: 'none' }}>
        <path d={`M ${cx},${cy+s*0.7} L ${cx-pr},${cy-pr*0.55} A ${pr},${pr} 0 1,1 ${cx+pr},${cy-pr*0.55} Z`}
          stroke={color} strokeWidth={sw} fill={color} fillOpacity={0.35} />
        <circle cx={cx} cy={cy-pr*0.3} r={pr*0.35} fill={color} />
      </g>
    }
    case 'flagpost-left':
      return <g {...g}>
        <line x1={cx+s*0.25} y1={cy-s} x2={cx+s*0.25} y2={cy+s} />
        <polygon points={`${cx+s*0.25},${cy-s} ${cx-s*0.5},${cy-s*0.65} ${cx+s*0.25},${cy-s*0.28}`} fill={color} strokeLinejoin="round" />
      </g>
    default:
      return <circle cx={cx} cy={cy} r={r} stroke={color} strokeWidth={sw} fill="none" style={{ pointerEvents: 'none' }} />
  }
}

// ── Universal POI symbol renderer ──────────────────────────────────────────

function renderPoiSymbol(poi: PoiEntry, pixelsPerMeter: number, customDefs: CustomMarkerDef[], opacity?: number): JSX.Element {
  const sw = Math.max(1.0, poi.strokeWeight)
  const op = opacity ?? 1
  const { x, y, color } = poi

  if (poi.typeId === 'mine') {
    const sizePx = poi.sizeM * pixelsPerMeter
    return <g opacity={op}><PoiMineSymbol cx={x} cy={y} sizePx={sizePx} color={color} sw={sw} /></g>
  }
  if (poi.typeId === 'bridge') {
    const lengthPx = (poi.bridgeLengthM ?? 30) * pixelsPerMeter
    const sepPx = (poi.bridgeSeparationM ?? 6) * pixelsPerMeter
    return <g opacity={op}><PoiBridgeSymbol cx={x} cy={y} lengthPx={lengthPx} sepPx={sepPx} sw={sw} color={color} rotation={poi.bridgeRotation ?? 0} /></g>
  }
  if (poi.typeId === 'cave') {
    const sizePx = poi.sizeM * pixelsPerMeter
    return (
      <g opacity={op} style={{ pointerEvents: 'none' }}>
        <text x={x} y={y} fontFamily={poi.fontFamily ?? 'serif'} fontSize={sizePx}
          fill={color} textAnchor="middle" dominantBaseline="middle">Ω</text>
      </g>
    )
  }
  // Custom type
  const def = customDefs.find((d) => d.id === poi.typeId)
  if (!def) return <circle cx={x} cy={y} r={8} stroke={color} strokeWidth={sw} fill="none" opacity={op} style={{ pointerEvents: 'none' }} />

  const sizePx = poi.sizeM * pixelsPerMeter

  if (def.symbol.kind === 'unicode') {
    return (
      <g opacity={op} style={{ pointerEvents: 'none' }}>
        <text x={x} y={y} fontFamily={poi.fontFamily ?? 'serif'} fontSize={sizePx}
          fill={color} textAnchor="middle" dominantBaseline="middle">{def.symbol.chars}</text>
      </g>
    )
  }
  if (def.symbol.kind === 'primitive') {
    return <g opacity={op}><PrimSymbol cx={x} cy={y} s={sizePx * 0.5} color={color} sw={sw} id={def.symbol.primitiveId} /></g>
  }
  // kind === 'builtin' — re-use the builtin renderer
  const builtinPoi: PoiEntry = { ...poi, typeId: def.symbol.builtinId }
  return renderPoiSymbol(builtinPoi, pixelsPerMeter, customDefs, opacity)
}

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

type DragRef = { type: 'elevation-flag' | 'slope-arrow' | 'ruggedness-flag' | 'swamp-marker' | 'building' | 'poi'; itemId: string; startX: number; startY: number; moved: boolean }
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
// Grid canvas overlay
// ---------------------------------------------------------------------------

function GridCanvas({ grid, measureBar, calibration, mapW, mapH }: {
  grid: GridConfig
  measureBar: MeasureBarConfig
  calibration: ElevationCalibration
  mapW: number
  mapH: number
}): JSX.Element | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    drawGridOnCanvas(ctx, mapW, mapH, grid, measureBar, calibration)
  }, [grid, measureBar, calibration, mapW, mapH])
  if (!grid.enabled) return null
  return (
    <canvas
      ref={canvasRef}
      width={mapW}
      height={mapH}
      style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  )
}

// ---------------------------------------------------------------------------
// Legend overlay
// ---------------------------------------------------------------------------

function LegendOverlay({ legend, frame, style, hasElevationFlags, hasSlopeArrows, measureBar, hasRuggednessFlags, ruggednessColorBySeverity, ruggednessSeverityColors, hasSwampMarkers, swampMarkerDefaults, roads, roadDefaults, buildings, pois, customMarkerDefs, elevationCalibration, ppi, mapW, heightmap }: {
  legend: LegendConfig; frame: FrameConfig; style: ContourStyle
  hasElevationFlags: boolean; hasSlopeArrows: boolean; measureBar?: MeasureBarConfig
  hasRuggednessFlags: boolean; ruggednessColorBySeverity: boolean; ruggednessSeverityColors: string[]
  hasSwampMarkers: boolean; swampMarkerDefaults: { color: string; boldness: 1|2|3 }
  roads: Road[]
  roadDefaults: { dirtColor: string; gravelColor: string; pavedColor: string; footpathColor: string; trailColor: string; stepsColor: string }
  buildings: BuildingEntry[]
  pois: PoiEntry[]
  customMarkerDefs: CustomMarkerDef[]
  elevationCalibration: ElevationCalibration
  ppi?: number
  mapW?: number
  heightmap?: HeightmapInfo | null
}): JSX.Element | null {
  const hasGeoAnchor = legend.showGeoAnchor && !!measureBar?.enabled && !!measureBar?.geoEnabled
  const geoAnchorLabel = hasGeoAnchor
    ? `${legend.geoAnchorLabel}: ${toDMS(measureBar!.anchorLat, true)}, ${toDMS(measureBar!.anchorLon, false)}`
    : ''
  const showColorBar = legend.showRuggednessFlags && hasRuggednessFlags
  const elevRange = (elevationCalibration.realMin !== null && elevationCalibration.realMax !== null)
    ? Math.abs(elevationCalibration.realMax - elevationCalibration.realMin) : undefined
  const unitAbbr = elevationCalibration.unitType === 'feet' ? 'ft'
    : elevationCalibration.unitType === 'meters' ? 'm'
    : elevationCalibration.unitType === 'custom' ? (elevationCalibration.customAbbr || '') : undefined
  const items = [
    legend.showMinorContour                           ? { type: 'minor',      label: legend.minorLabel,          color: style.minorColor }  : null,
    legend.showMajorContour                           ? { type: 'major',      label: legend.majorLabel,          color: style.majorColor }  : null,
    legend.showSeaLevel && style.showSeaLevel         ? { type: 'sea-level',  label: legend.seaLevelLabel,       color: style.seaLevelColor }: null,
    legend.showElevationFlags && hasElevationFlags    ? { type: 'flag',       label: legend.flagLabel,           color: style.labelColor }  : null,
    legend.showSlopeArrows && hasSlopeArrows          ? { type: 'arrow',      label: legend.arrowLabel,          color: style.labelColor }  : null,
    hasGeoAnchor                                      ? { type: 'geo-anchor', label: geoAnchorLabel,             color: legend.color }      : null,
    showColorBar                                      ? { type: 'ruggedness', label: legend.ruggednessFlagLabel, color: legend.color }      : null,
    legend.showSwampMarkers && hasSwampMarkers         ? { type: 'swamp',      label: legend.swampMarkerLabel,    color: swampMarkerDefaults.color }: null,
    legend.showDirtRoads && roads.some(r => r.type === 'dirt')     ? { type: 'road-dirt',    label: legend.dirtRoadsLabel,  color: roadDefaults.dirtColor    } : null,
    legend.showGravelRoads && roads.some(r => r.type === 'gravel') ? { type: 'road-gravel',  label: legend.gravelRoadsLabel, color: roadDefaults.gravelColor  } : null,
    legend.showPavedRoads && roads.some(r => r.type === 'paved')   ? { type: 'road-paved',   label: legend.pavedRoadsLabel, color: roadDefaults.pavedColor   } : null,
    legend.showFootpaths && roads.some(r => r.type === 'footpath') ? { type: 'road-footpath',label: legend.footpathsLabel,  color: roadDefaults.footpathColor} : null,
    legend.showTrails && roads.some(r => r.type === 'trail')       ? { type: 'road-trail',   label: legend.trailsLabel,     color: roadDefaults.trailColor   } : null,
    legend.showSteps && roads.some(r => r.type === 'steps')        ? { type: 'road-steps',   label: legend.stepsLabel,      color: roadDefaults.stepsColor   } : null,
  ].filter(Boolean) as { type: string; label: string; color: string; buildingShapes?: Array<{ shape: BuildingShape; color: string; widthM: number; depthM: number }>; poiSample?: PoiEntry }[]

  // Building legend items: group by (templateId, color), then merge same-label entries
  if (legend.showBuildings && buildings.length > 0) {
    const seen = new Map<string, { shape: BuildingShape; color: string; label: string; widthM: number; depthM: number }>()
    for (const b of buildings) {
      const tid = b.templateId ?? ''
      const key = `${tid}::${b.color}`
      if (!seen.has(key)) {
        const tpl = BUILDING_CATALOG.flatMap(g => g.buildings).find(t => t.id === tid)
        const label = legend.buildingLabels[key] || tpl?.name || tid || b.shape
        seen.set(key, { shape: b.shape, color: b.color, label, widthM: b.widthM, depthM: b.depthM })
      }
    }
    // Group entries that share the same label into one row
    const byLabel = new Map<string, Array<{ shape: BuildingShape; color: string; widthM: number; depthM: number }>>()
    for (const { shape, color, label, widthM, depthM } of seen.values()) {
      if (!byLabel.has(label)) byLabel.set(label, [])
      byLabel.get(label)!.push({ shape, color, widthM, depthM })
    }
    for (const [label, shapes] of byLabel) {
      items.push({ type: 'building', label, color: shapes[0].color, buildingShapes: shapes })
    }
  }

  // POI legend items: one entry per typeId present on the map
  if (legend.showPois && pois.length > 0) {
    const seen = new Set<string>()
    for (const p of pois) {
      if (!seen.has(p.typeId)) {
        seen.add(p.typeId)
        const defaultName = p.typeId === 'mine' ? BUILTIN_MARKER_SPECS.mine.name
          : p.typeId === 'bridge' ? BUILTIN_MARKER_SPECS.bridge.name
          : p.typeId === 'cave' ? BUILTIN_MARKER_SPECS.cave.name
          : (customMarkerDefs.find((d) => d.id === p.typeId)?.name ?? p.typeId)
        const label = legend.poiLabels[p.typeId] || defaultName
        items.push({ type: 'poi', label, color: p.color, poiSample: p })
      }
    }
  }

  // Scale ratio and scale bar computation
  const groundWidthM = elevationCalibration.mapWidth && elevationCalibration.mapWidth > 0
    ? calToMeters(elevationCalibration.mapWidth, elevationCalibration)
    : null
  const scaleRatioNum = groundWidthM && ppi && ppi > 0 && heightmap && heightmap.width > 0
    ? groundWidthM / heightmap.width * ppi / 0.0254
    : null
  const scaleRatioText = legend.showScaleRatio && scaleRatioNum !== null
    ? `1:${Math.round(scaleRatioNum).toLocaleString()}`
    : null
  const scaleBarInfo = legend.showScaleBar && groundWidthM && ppi && ppi > 0 && mapW && mapW > 0 && heightmap && heightmap.width > 0
    ? (() => {
        const rawLengthM = legend.scaleBarLengthM != null && legend.scaleBarLengthM > 0
          ? legend.scaleBarLengthM
          : niceBarDistance((2.5 / 2.54) * ppi * groundWidthM / heightmap.width)
        if (rawLengthM <= 0) return null
        const barScreenPx = rawLengthM * mapW / groundWidthM
        if (barScreenPx < 8) return null
        return { rawLengthM, barScreenPx }
      })()
    : null

  if (items.length === 0 && !scaleRatioText && !scaleBarInfo) return null

  const fs = legend.fontSize
  const rowH = fs * 1.6
  const sampW = fs * 3
  const gapX = fs * 0.6
  const pad = fs * 0.6
  const colGap = pad
  const maxLabelLen = items.length > 0 ? Math.max(...items.map(i => i.label.length)) : 0
  const colW = sampW + gapX + maxLabelLen * fs * 0.56

  const cols = items.length > 0 ? Math.max(1, Math.min(legend.columns, items.length)) : 1
  const rows = items.length > 0 ? Math.ceil(items.length / cols) : 0

  const barH = fs * 1.2
  const barLabelH = fs * 2.1
  const barTitleH = fs * 0.9
  const barSectionH = showColorBar ? (pad + barTitleH + barH + barLabelH) : 0

  const headerH = scaleRatioText ? Math.max(legend.scaleRatioFontSize * 1.8, rowH) : 0
  const minBarW = showColorBar ? 5 * fs * 3.2 : 0
  const scaleBarMinW = scaleBarInfo ? scaleBarInfo.barScreenPx + 2 * pad : 0
  const boxW = Math.max(pad + cols * colW + (cols - 1) * colGap + pad, minBarW + 2 * pad, scaleBarMinW)
  const boxH_items = pad + headerH + rows * rowH + pad
  const boxH = boxH_items + barSectionH
  const edgeGap = Math.max(4, (frame.borderEnabled ? frame.borderWidth * 2 : 0) + 3)

  return (
    <svg width={boxW} height={boxH} style={getElementPositionStyle(legend.position, frame, boxW, boxH, edgeGap)} overflow="visible">
      <rect x={0.5} y={0.5} width={boxW-1} height={boxH-1}
        fill={frame.marginColor} stroke={legend.color} strokeWidth={0.5} rx={1.5} />
      {(() => {
        // One shared scale for all building icons — largest building fills the box,
        // all others are drawn proportionally smaller.
        const bBh = rowH * 0.72
        let buildingGlobalScale = 1
        const allBuildingShapes = items.flatMap(it => it.buildingShapes ?? [])
        if (allBuildingShapes.length > 0) {
          let gs = Infinity
          for (const { widthM, depthM } of allBuildingShapes) {
            gs = Math.min(gs, sampW * 0.88 / widthM, bBh / depthM)
          }
          buildingGlobalScale = isFinite(gs) ? gs : 1
        }
        return items.map(({ type, label, color, buildingShapes, poiSample }, i) => {
        const col = Math.floor(i / rows)
        const row = i % rows
        const sx1 = pad + col * (colW + colGap)
        const sx2 = sx1 + sampW
        const midY = pad + headerH + row * rowH + rowH / 2

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
          const sc = rowH * 0.45
          const cx = sx1 + sampW / 2
          const cy_tip = midY + sc * 0.825
          const iconColor = ruggednessColorBySeverity ? TRI_COLORS[2] : legend.color
          sample = (
            <polygon
              points={`${cx},${cy_tip} ${cx-sc*0.48},${cy_tip-sc*0.8} ${cx-sc*0.32},${cy_tip-sc*1.5} ${cx-sc*0.1},${cy_tip-sc*0.95} ${cx+sc*0.05},${cy_tip-sc*1.65} ${cx+sc*0.22},${cy_tip-sc*1.05} ${cx+sc*0.38},${cy_tip-sc*1.35} ${cx+sc*0.48},${cy_tip-sc*0.8}`}
              fill={iconColor} stroke="rgba(0,0,0,0.3)" strokeWidth={0.7} strokeLinejoin="round"
            />
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
        } else if (type === 'road-dirt') {
          const gap = rowH * 0.22
          sample = (
            <g>
              <line x1={sx1} y1={midY - gap} x2={sx2} y2={midY - gap}
                stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="2 3" />
              <line x1={sx1} y1={midY + gap} x2={sx2} y2={midY + gap}
                stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="2 3" />
            </g>
          )
        } else if (type === 'road-gravel') {
          const gap = rowH * 0.22
          sample = (
            <g>
              <line x1={sx1} y1={midY - gap} x2={sx2} y2={midY - gap}
                stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="5 2" />
              <line x1={sx1} y1={midY + gap} x2={sx2} y2={midY + gap}
                stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="5 2" />
            </g>
          )
        } else if (type === 'road-paved') {
          const gap = rowH * 0.22
          sample = (
            <g>
              <line x1={sx1} y1={midY - gap} x2={sx2} y2={midY - gap}
                stroke={color} strokeWidth={1.2} strokeLinecap="round" />
              <line x1={sx1} y1={midY + gap} x2={sx2} y2={midY + gap}
                stroke={color} strokeWidth={1.2} strokeLinecap="round" />
            </g>
          )
        } else if (type === 'road-footpath') {
          sample = (
            <line x1={sx1} y1={midY} x2={sx2} y2={midY}
              stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="1 3" />
          )
        } else if (type === 'road-trail') {
          sample = (
            <line x1={sx1} y1={midY} x2={sx2} y2={midY}
              stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeDasharray="1 2 5 2" />
          )
        } else if (type === 'road-steps') {
          const tickH = rowH * 0.45
          const nTicks = 5
          const step = sampW / (nTicks + 1)
          sample = (
            <g>
              {Array.from({ length: nTicks }, (_, i) => {
                const x = sx1 + step * (i + 1)
                return <line key={i} x1={x} y1={midY - tickH / 2} x2={x} y2={midY + tickH / 2}
                  stroke={color} strokeWidth={1.2} strokeLinecap="round" />
              })}
            </g>
          )
        } else if (type === 'building' && buildingShapes && buildingShapes.length > 0) {
          const n = buildingShapes.length
          const slotW = sampW / n
          sample = (
            <g>
              {buildingShapes.map(({ shape, color: bc, widthM, depthM }, si) => {
                const cx = sx1 + si * slotW + slotW / 2
                const pw = widthM * buildingGlobalScale
                const pd = depthM * buildingGlobalScale
                const d = buildingPath(shape, cx, midY, pw, pd)
                return (
                  <path key={si} d={d}
                    fill={bc} fillOpacity={0.6}
                    stroke={bc} strokeWidth={0.8}
                    fillRule={shape === 'courtyard' ? 'evenodd' : undefined} />
                )
              })}
            </g>
          )
        } else if (type === 'poi' && poiSample) {
          // Scale the sample to fit in the legend slot
          const legendSample: PoiEntry = { ...poiSample, x: sx1 + sampW / 2, y: midY }
          const targetPx = poiSample.typeId === 'bridge'
            ? sampW * 0.88 / Math.max(poiSample.bridgeLengthM ?? 30, 0.1)
            : rowH * 0.68 / Math.max(poiSample.sizeM, 0.1)
          sample = renderPoiSymbol(legendSample, targetPx, customMarkerDefs)
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
      })
    })()}

      {/* Scale ratio header */}
      {scaleRatioText && (
        <text x={boxW / 2} y={pad + headerH / 2}
          fontSize={legend.scaleRatioFontSize} fontFamily="serif" fill={legend.scaleRatioColor}
          dominantBaseline="middle" textAnchor="middle"
          fontStyle={legend.scaleRatioItalic ? 'italic' : undefined}
          fontWeight={legend.scaleRatioBold ? 'bold' : undefined}>
          {scaleRatioText}
        </text>
      )}

      {/* TRI severity color bar */}
      {showColorBar && (() => {
        const barY = boxH_items
        const barX = pad
        const barInnerW = boxW - 2 * pad
        const tierW = barInnerW / 5
        return (
          <g>
            <line x1={pad} y1={barY} x2={boxW - pad} y2={barY} stroke={legend.color} strokeWidth={0.3} strokeOpacity={0.4} />
            <text x={barX} y={barY + fs * 0.1} fontSize={fs * 0.75} fontFamily="sans-serif"
              fill={legend.color} dominantBaseline="hanging">{legend.ruggednessFlagLabel}</text>
            {ruggednessSeverityColors.map((color, i) => (
              <rect key={i} x={barX + i * tierW} y={barY + pad * 0.5 + barTitleH} width={tierW} height={barH}
                fill={color} />
            ))}
            {TRI_LABELS.map((label, i) => (
              <g key={i}>
                <text
                  x={barX + i * tierW + tierW / 2}
                  y={barY + pad * 0.5 + barTitleH + barH + fs * 0.15}
                  fontSize={fs * 0.75} fontFamily="sans-serif" fill={legend.color}
                  textAnchor="middle" dominantBaseline="hanging">
                  {label}
                </text>
                <text
                  x={barX + i * tierW + tierW / 2}
                  y={barY + pad * 0.5 + barTitleH + barH + fs * 1.05}
                  fontSize={fs * 0.6} fontFamily="sans-serif" fill={legend.color}
                  textAnchor="middle" dominantBaseline="hanging">
                  {triRangeLabel(i, elevRange, unitAbbr)}
                </text>
              </g>
            ))}
          </g>
        )
      })()}
      {/* Scale bar — rendered outside the legend box via overflow="visible" */}
      {scaleBarInfo && (() => {
        const { rawLengthM, barScreenPx } = scaleBarInfo
        const sbH = legend.scaleBarHeight
        const c1 = legend.scaleBarColor1
        const c2 = legend.scaleBarColor2
        const sbLs = legend.scaleBarLabelSize
        const sbLc = legend.scaleBarLabelColor
        const divs = Math.max(1, legend.scaleBarDivisions)
        const divW = barScreenPx / divs
        const sbGap = 4
        const labelGap = 2
        const labelAreaH = sbLs * 1.5
        const subLabelH = legend.scaleBarClassicSubLabels ? sbLs * 1.2 : 0
        const totalH = sbH + labelGap + labelAreaH + subLabelH

        const sbLeft = Math.max(pad, (boxW - barScreenPx) / 2)
        const sbTop = legend.scaleBarPosition === 'above' ? -(sbGap + totalH) : boxH + sbGap
        const sbBottom = sbTop + sbH
        const mainLabelY = sbBottom + labelGap
        const subLabelY = mainLabelY + labelAreaH

        function fmtMetric(m: number): string {
          if (m >= 1000) return `${+(m / 1000).toFixed(1)} km`
          return `${Math.round(m)} m`
        }
        function fmtImperial(m: number): string {
          const ft = m / 0.3048
          if (ft >= 5280) return `${+(ft / 5280).toFixed(1)} mi`
          return `${Math.round(ft)} ft`
        }
        const fmtMain = (m: number) => legend.scaleBarUnits === 'metric' ? fmtMetric(m) : fmtImperial(m)
        const fmtSub  = (m: number) => legend.scaleBarUnits === 'metric' ? fmtImperial(m) : fmtMetric(m)

        const labelIdxs = legend.scaleBarLabelAll
          ? Array.from({ length: divs + 1 }, (_, i) => i)
          : [0, divs]

        function border(): JSX.Element | null {
          if (legend.scaleBarBorder === 'none') return null
          if (legend.scaleBarBorder === 'double') return (
            <g fill="none" stroke={c1}>
              <rect x={sbLeft} y={sbTop} width={barScreenPx} height={sbH} strokeWidth={1.2} />
              <rect x={sbLeft + 1.5} y={sbTop + 1.5} width={barScreenPx - 3} height={sbH - 3} strokeWidth={0.6} />
            </g>
          )
          const rx = legend.scaleBarBorder === 'rounded' ? sbH * 0.3 : 0
          return <rect x={sbLeft} y={sbTop} width={barScreenPx} height={sbH} fill="none" stroke={c1} strokeWidth={0.8} rx={rx} />
        }

        const sty = legend.scaleBarStyle
        return (
          <g>
            {sty === 'line' && (
              <g stroke={c1} fill="none">
                <line x1={sbLeft} y1={sbTop} x2={sbLeft} y2={sbBottom} strokeWidth={0.8} />
                <line x1={sbLeft + barScreenPx} y1={sbTop} x2={sbLeft + barScreenPx} y2={sbBottom} strokeWidth={0.8} />
                <line x1={sbLeft} y1={sbBottom} x2={sbLeft + barScreenPx} y2={sbBottom} strokeWidth={0.8} />
                {Array.from({ length: divs - 1 }, (_, i) => {
                  const x = sbLeft + (i + 1) * divW
                  return <line key={i} x1={x} y1={sbTop + sbH * 0.4} x2={x} y2={sbBottom} strokeWidth={0.6} />
                })}
                {border()}
              </g>
            )}
            {sty === 'banded' && (
              <g>
                {Array.from({ length: divs }, (_, i) => (
                  <rect key={i} x={sbLeft + i * divW} y={sbTop} width={divW} height={sbH}
                    fill={i % 2 === 0 ? c1 : c2} />
                ))}
                {border()}
              </g>
            )}
            {sty === 'open' && (
              <g>
                {Array.from({ length: divs }, (_, i) => (
                  <rect key={i} x={sbLeft + i * divW} y={sbTop} width={divW} height={sbH}
                    fill={i % 2 === 0 ? c2 : 'transparent'} stroke={c1} strokeWidth={0.8} />
                ))}
                {border()}
              </g>
            )}
            {sty === 'classic' && (
              <g>
                {Array.from({ length: divs }, (_, i) => {
                  const x = sbLeft + i * divW
                  const h2 = sbH / 2
                  return (
                    <g key={i}>
                      <rect x={x} y={sbTop}      width={divW} height={h2} fill={i % 2 === 0 ? c1 : c2} />
                      <rect x={x} y={sbTop + h2} width={divW} height={h2} fill={i % 2 === 0 ? c2 : c1} />
                    </g>
                  )
                })}
                {border()}
              </g>
            )}
            {labelIdxs.map((idx) => (
              <text key={idx} x={sbLeft + idx * divW} y={mainLabelY}
                fontSize={sbLs} fontFamily="sans-serif" fill={sbLc}
                dominantBaseline="hanging" textAnchor="middle">
                {fmtMain((idx / divs) * rawLengthM)}
              </text>
            ))}
            {legend.scaleBarClassicSubLabels && labelIdxs.map((idx) => (
              <text key={idx} x={sbLeft + idx * divW} y={subLabelY}
                fontSize={sbLs * 0.85} fontFamily="sans-serif" fill={sbLc}
                dominantBaseline="hanging" textAnchor="middle">
                {fmtSub((idx / divs) * rawLengthM)}
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
  const roads = useStore((s) => s.roads)
  const addRoad = useStore((s) => s.addRoad)
  const updateRoad = useStore((s) => s.updateRoad)
  const removeRoad = useStore((s) => s.removeRoad)
  const roadsVisible = useStore((s) => s.roadsVisible)
  const roadDefaults = useStore((s) => s.roadDefaults)
  const selectedItems = useStore((s) => s.selectedItems)
  const selectItem = useStore((s) => s.selectItem)
  const shiftSelectItem = useStore((s) => s.shiftSelectItem)
  const clearSelection = useStore((s) => s.clearSelection)
  const deleteSelected = useStore((s) => s.deleteSelected)
  const buildings = useStore((s) => s.buildings)
  const addBuilding = useStore((s) => s.addBuilding)
  const updateBuilding = useStore((s) => s.updateBuilding)
  const removeBuilding = useStore((s) => s.removeBuilding)
  const buildingsVisible = useStore((s) => s.buildingsVisible)
  const buildingDefaults = useStore((s) => s.buildingDefaults)
  const pois = useStore((s) => s.pois)
  const addPoi = useStore((s) => s.addPoi)
  const updatePoi = useStore((s) => s.updatePoi)
  const removePoi = useStore((s) => s.removePoi)
  const poisVisible = useStore((s) => s.poisVisible)
  const poiNewMarker = useStore((s) => s.poiNewMarker)
  const curvedLabels = useStore((s) => s.curvedLabels)
  const addCurvedLabel = useStore((s) => s.addCurvedLabel)
  const updateCurvedLabel = useStore((s) => s.updateCurvedLabel)
  const removeCurvedLabel = useStore((s) => s.removeCurvedLabel)
  const customMarkerDefs = useGlobalStore((s) => s.customMarkerDefs)
  const elevationFlagDefaults = useStore((s) => s.elevationFlagDefaults)
  const slopeArrowDefaults = useStore((s) => s.slopeArrowDefaults)
  const ruggednessFlagDefaults = useStore((s) => s.ruggednessFlagDefaults)
  const elevationFlagsVisible = useStore((s) => s.elevationFlagsVisible)
  const slopeArrowsVisible = useStore((s) => s.slopeArrowsVisible)
  const ruggednessFlagsVisible = useStore((s) => s.ruggednessFlagsVisible)
  const swampMarkersVisible = useStore((s) => s.swampMarkersVisible)
  const ruggednessSeverityColors = useStore((s) => s.ruggednessSeverityColors)

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

  const [confirmMultiDeleteOpen, setConfirmMultiDeleteOpen] = useState(false)

  // Drag state for annotation tools
  const [dragPos, setDragPos] = useState<DragPos | null>(null)
  const [hoverPos, setHoverPos] = useState<DragPos | null>(null)
  const dragRef = useRef<DragRef | null>(null)
  const flagSvgRef = useRef<SVGSVGElement>(null)
  const selectedItemsRef = useRef(selectedItems)
  selectedItemsRef.current = selectedItems
  // Derived single-item refs for key handlers
  const singleCurvedLabelId = selectedItems.length === 1 && selectedItems[0].type === 'curved-label' ? selectedItems[0].id : null
  const singleCurvedLabelIdRef = useRef<string | null>(singleCurvedLabelId)
  singleCurvedLabelIdRef.current = singleCurvedLabelId

  // Road drawing state
  const [inProgressPts, setInProgressPts] = useState<{ x: number; y: number }[]>([])
  const [roadHoverPt, setRoadHoverPt] = useState<{ x: number; y: number; elevation?: number } | null>(null)
  const roadAnchorDragRef = useRef<{ roadId: string; ptIdx: number } | null>(null)
  const lastClickTimeRef = useRef<number>(0)
  const roadsRef = useRef(roads)
  roadsRef.current = roads
  const roadDefaultsRef = useRef(roadDefaults)
  roadDefaultsRef.current = roadDefaults

  // Curved-label drawing state
  const [inProgressLabelPts, setInProgressLabelPts] = useState<{ x: number; y: number }[]>([])
  const [labelHoverPt, setLabelHoverPt] = useState<{ x: number; y: number } | null>(null)
  const labelAnchorDragRef = useRef<{ labelId: string; ptIdx: number } | null>(null)
  const lastLabelClickTimeRef = useRef<number>(0)
  const inProgressLabelPtsRef = useRef(inProgressLabelPts)
  inProgressLabelPtsRef.current = inProgressLabelPts
  const curvedLabelsRef = useRef(curvedLabels)
  curvedLabelsRef.current = curvedLabels
  const buildingDefaultsRef = useRef(buildingDefaults)
  buildingDefaultsRef.current = buildingDefaults
  const poiNewMarkerRef = useRef(poiNewMarker)
  poiNewMarkerRef.current = poiNewMarker
  const inProgressPtsRef = useRef(inProgressPts)
  inProgressPtsRef.current = inProgressPts

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

  // Escape cancels active tool / clears selection; Delete removes selected items
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept Delete while user is typing
      const active = document.activeElement
      const isTyping = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement

      if (e.key === 'Escape') {
        if (mapTool === 'road' && inProgressPtsRef.current.length > 0) {
          setInProgressPts([])
          setRoadHoverPt(null)
          return
        }
        if (mapTool === 'curved-label' && inProgressLabelPtsRef.current.length > 0) {
          setInProgressLabelPts([])
          setLabelHoverPt(null)
          return
        }
        setMapTool('none')
        clearSelection()
        dragRef.current = null
        setDragPos(null)
        setHoverPos(null)
      }
      if (e.key === 'Enter' && mapTool === 'road' && inProgressPtsRef.current.length >= 2) {
        commitRoad(inProgressPtsRef.current, false)
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && mapTool === 'curved-label' && inProgressLabelPtsRef.current.length >= 2) {
        if (e.key === 'Tab') e.preventDefault()
        commitLabel(inProgressLabelPtsRef.current)
        return
      }
      if (e.key === 'Tab' && singleCurvedLabelIdRef.current && inProgressLabelPtsRef.current.length === 0) {
        e.preventDefault()
        const labels = curvedLabelsRef.current
        const idx = labels.findIndex(l => l.id === singleCurvedLabelIdRef.current)
        const next = labels[idx + 1]
        if (next) selectItem('curved-label', next.id)
        else clearSelection()
        return
      }
      if (e.key === 'Delete' && !isTyping) {
        const items = selectedItemsRef.current
        if (items.length === 0) return
        if (items.length === 1) {
          deleteSelected()
        } else {
          setConfirmMultiDeleteOpen(true)
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mapTool, setMapTool, clearSelection, selectItem, deleteSelected])

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
      if (dragRef.current.type === 'elevation-flag') {
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
          if (type === 'elevation-flag') {
            const elev = computeElevationAt(pt.x, pt.y) ?? 0
            updateElevationFlag(itemId, { x: pt.x, y: pt.y, elevation: elev })
          } else if (type === 'slope-arrow') {
            const slope = computeSlopeAt(pt.x, pt.y)
            if (slope) updateSlopeArrow(itemId, { x: pt.x, y: pt.y, ...slope })
          } else if (type === 'ruggedness-flag') {
            const triNorm = computeTriAt(pt.x, pt.y) ?? 0
            updateRuggednessFlag(itemId, { x: pt.x, y: pt.y, triNorm })
          } else if (type === 'swamp-marker') {
            updateSwampMarker(itemId, { x: pt.x, y: pt.y })
          } else if (type === 'building') {
            updateBuilding(itemId, { x: pt.x, y: pt.y })
          } else if (type === 'poi') {
            updatePoi(itemId, { x: pt.x, y: pt.y })
          }
        }
      } else {
        // click (no drag) — select the item
        if (e.shiftKey) shiftSelectItem(type as SelectableItemType, itemId)
        else selectItem(type as SelectableItemType, itemId)
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
  }, [getSvgPoint, computeElevationAt, computeSlopeAt, computeTriAt, updateElevationFlag, updateSlopeArrow, updateRuggednessFlag, updateSwampMarker, updateBuilding, updatePoi, selectItem, shiftSelectItem])

  // Road anchor point drag — document-level so drag continues outside SVG
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!roadAnchorDragRef.current) return
      const svgEl = document.getElementById('annotation-svg') as SVGSVGElement | null
      if (!svgEl) return
      const pt = svgEl.createSVGPoint()
      pt.x = e.clientX; pt.y = e.clientY
      const svgPt = pt.matrixTransform(svgEl.getScreenCTM()!.inverse())
      const { roadId, ptIdx } = roadAnchorDragRef.current
      const road = roadsRef.current.find(r => r.id === roadId)
      if (!road) return
      updateRoad(roadId, {
        points: road.points.map((p, i) =>
          i === ptIdx ? { x: svgPt.x, y: svgPt.y } : p
        ),
      })
    }
    const onUp = () => { roadAnchorDragRef.current = null }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [updateRoad])

  // Curved-label anchor point drag
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!labelAnchorDragRef.current) return
      const svgEl = document.getElementById('annotation-svg') as SVGSVGElement | null
      if (!svgEl) return
      const pt = svgEl.createSVGPoint()
      pt.x = e.clientX; pt.y = e.clientY
      const svgPt = pt.matrixTransform(svgEl.getScreenCTM()!.inverse())
      const { labelId, ptIdx } = labelAnchorDragRef.current
      const label = curvedLabelsRef.current.find(l => l.id === labelId)
      if (!label) return
      updateCurvedLabel(labelId, {
        points: label.points.map((p, i) =>
          i === ptIdx ? { x: svgPt.x, y: svgPt.y } : p
        ),
      })
    }
    const onUp = () => { labelAnchorDragRef.current = null }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [updateCurvedLabel])

  // Clear hover preview whenever the tool mode is turned off
  useEffect(() => {
    if (mapTool === 'none') { setHoverPos(null) }
    if (mapTool !== 'road') { setInProgressPts([]); setRoadHoverPt(null) }
    if (mapTool !== 'curved-label') { setInProgressLabelPts([]); setLabelHoverPt(null) }
  }, [mapTool])

  function commitRoad(pts: { x: number; y: number }[], closed: boolean) {
    if (!heightmap || pts.length < 2) { setInProgressPts([]); return }
    const tw = heightmap.width * roadDefaultsRef.current.trackWidthFraction
    const sw = tw * roadDefaultsRef.current.strokeWeightFraction
    const hs = heightmap.width * roadDefaultsRef.current.hatchSpacingFraction
    const t = roadDefaultsRef.current.type
    const color = t === 'dirt' ? roadDefaultsRef.current.dirtColor
      : t === 'gravel' ? roadDefaultsRef.current.gravelColor
      : t === 'paved' ? roadDefaultsRef.current.pavedColor
      : t === 'footpath' ? roadDefaultsRef.current.footpathColor
      : t === 'steps' ? roadDefaultsRef.current.stepsColor
      : roadDefaultsRef.current.trailColor
    addRoad({
      id: crypto.randomUUID(),
      type: roadDefaultsRef.current.type,
      points: pts,
      closed,
      label: '',
      color,
      trackWidth: tw,
      strokeWeight: sw,
      hatchSpacing: hs,
      opacity: roadDefaultsRef.current.opacity,
    })
    setInProgressPts([])
    setRoadHoverPt(null)
  }

  function commitLabel(pts: { x: number; y: number }[]) {
    if (pts.length < 2) { setInProgressLabelPts([]); setLabelHoverPt(null); return }
    const id = crypto.randomUUID()
    addCurvedLabel({ id, points: pts, ...defaultCurvedLabelStyle })
    selectItem('curved-label', id)
    setMapTool('none')
    setInProgressLabelPts([])
    setLabelHoverPt(null)
  }

  function handleSvgMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (mapTool === 'road') {
      const pt = getSvgPoint(e.clientX, e.clientY)
      if (pt) {
        const elevation = computeElevationAt(pt.x, pt.y)
        setRoadHoverPt({ x: pt.x, y: pt.y, elevation: elevation ?? undefined })
      }
      return
    }
    if (mapTool === 'curved-label') {
      const pt = getSvgPoint(e.clientX, e.clientY)
      if (pt) setLabelHoverPt({ x: pt.x, y: pt.y })
      return
    }
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
    } else if (mapTool === 'building') {
      setHoverPos({ x: pt.x, y: pt.y })
    } else if (mapTool === 'poi') {
      setHoverPos({ x: pt.x, y: pt.y })
    }
  }

  function handleSvgMouseLeave() {
    setHoverPos(null)
    setRoadHoverPt(null)
  }

  function handleItemMouseDown(e: React.MouseEvent, type: DragRef['type'], itemId: string) {
    e.stopPropagation()
    const pt = getSvgPoint(e.clientX, e.clientY)
    if (!pt) return
    dragRef.current = { type, itemId, startX: pt.x, startY: pt.y, moved: false }
  }

  // Fires only for background clicks — annotation elements call stopPropagation
  function handleSvgMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    if (mapTool === 'road') {
      const pt = getSvgPoint(e.clientX, e.clientY)
      if (!pt) return
      const now = Date.now()
      const isDouble = now - lastClickTimeRef.current < 300
      lastClickTimeRef.current = now
      if (isDouble && inProgressPtsRef.current.length >= 2) {
        // Commit road on double-click (remove last point added by first click of dblclick)
        const pts = inProgressPtsRef.current.slice(0, -1)
        if (pts.length >= 2) commitRoad(pts, false)
        return
      }
      // Check if clicking near first point to close
      if (inProgressPtsRef.current.length >= 3) {
        const first = inProgressPtsRef.current[0]
        const dist = Math.sqrt((pt.x - first.x) ** 2 + (pt.y - first.y) ** 2)
        const tw = heightmap ? heightmap.width * roadDefaultsRef.current.trackWidthFraction : 10
        if (dist < tw * 3) {
          commitRoad(inProgressPtsRef.current, true)
          return
        }
      }
      setInProgressPts(prev => [...prev, { x: pt.x, y: pt.y }])
      return
    }
    if (mapTool === 'curved-label') {
      const pt = getSvgPoint(e.clientX, e.clientY)
      if (!pt) return
      const now = Date.now()
      const isDouble = now - lastLabelClickTimeRef.current < 300
      lastLabelClickTimeRef.current = now
      if (isDouble && inProgressLabelPtsRef.current.length >= 2) {
        const pts = inProgressLabelPtsRef.current.slice(0, -1)
        if (pts.length >= 2) commitLabel(pts)
        return
      }
      setInProgressLabelPts(prev => [...prev, { x: pt.x, y: pt.y }])
      return
    }
    clearSelection()
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
    } else if (mapTool === 'building') {
      const d = buildingDefaultsRef.current
      const tpl = BUILDING_CATALOG.flatMap(g => g.buildings).find(b => b.id === d.buildingTemplateId)
      addBuilding({
        id: crypto.randomUUID(),
        x: pt.x,
        y: pt.y,
        rotation: d.rotation,
        widthM: d.widthM,
        depthM: d.depthM,
        shape: tpl?.shape ?? 'rectangle',
        color: d.color,
        opacity: d.opacity,
        templateId: d.buildingTemplateId,
      })
    } else if (mapTool === 'poi') {
      const d = poiNewMarkerRef.current
      const entry: PoiEntry = {
        id: crypto.randomUUID(),
        x: pt.x,
        y: pt.y,
        typeId: d.typeId,
        color: d.color,
        sizeM: d.sizeM,
        strokeWeight: d.strokeWeight,
        ...(d.typeId === 'bridge' ? {
          bridgeLengthM: d.bridgeLengthM,
          bridgeSeparationM: d.bridgeSeparationM,
          bridgeRotation: d.bridgeRotation,
        } : {}),
        ...((d.typeId === 'cave' || customMarkerDefs.find(cd => cd.id === d.typeId)?.symbol.kind === 'unicode') ? { fontFamily: d.fontFamily } : {}),
        ...(d.label ? { label: d.label, labelColor: d.labelColor, labelSizeM: d.labelSizeM, labelFontFamily: d.labelFontFamily } : {}),
      }
      addPoi(entry)
    }
  }

  const mapZoom = useStore((s) => s.mapZoom)
  const setMapZoom = useStore((s) => s.setMapZoom)
  const hillshadeView = useStore((s) => s.hillshadeView)
  const overlayBrightness = useStore((s) => s.overlayBrightness)
  const showOverlays = hillshadeView !== 'hillshade-only'
  const frame = useStore((s) => s.frame)
  const title = useStore((s) => s.title)
  const compass = useStore((s) => s.compass)
  const legend = useStore((s) => s.legend)
  const grid = useStore((s) => s.grid)
  const ppi = useStore((s) => s.ppi)
  const waterLakes = useStore((s) => s.waterLakes)
  const waterRivers = useStore((s) => s.waterRivers)
  const riverBaseStrokeWidth = useStore((s) => s.riverBaseStrokeWidth)
  const waterLakesVisible = useStore((s) => s.waterLakesVisible)
  const waterRiversVisible = useStore((s) => s.waterRiversVisible)
  const vegetationLayers = useStore((s) => s.vegetationLayers)
  const vegetationLayersVisible = useStore((s) => s.vegetationLayersVisible)

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

  // svgPinScale: converts "desired screen px" → SVG coordinate units, zoom-invariant
  const svgPinScale = (innerMapSize && heightmap)
    ? heightmap.width / innerMapSize.w
    : (heightmap ? heightmap.width / 800 : 1)

  const toolActive = mapTool === 'elevation-flag' || mapTool === 'slope-arrow' || mapTool === 'measure-anchor' || mapTool === 'ruggedness-flag' || mapTool === 'swamp-marker' || mapTool === 'road' || mapTool === 'building' || mapTool === 'poi' || mapTool === 'curved-label'
  const flagSvgInteractive = toolActive || elevationFlags.length > 0 || slopeArrows.length > 0 || ruggednessFlags.length > 0 || swampMarkers.length > 0 || roads.length > 0 || buildings.length > 0 || pois.length > 0 || curvedLabels.length > 0

  const pixelsPerMeter = (() => {
    if (!heightmap || !elevationCalibration.mapWidth || elevationCalibration.mapWidth <= 0) {
      return heightmap ? heightmap.width * 0.01 : 1
    }
    const cal = elevationCalibration
    const metersPerUnit = cal.unitType === 'feet' ? 0.3048
      : cal.unitType === 'meters' ? 1
      : (cal.customRatio ?? 1) * (cal.customBase === 'feet' ? 0.3048 : 1)
    return heightmap.width / (cal.mapWidth * metersPerUnit)
  })()

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
        backgroundColor: hillshadeView === 'overlay-only'
          ? `rgb(${Math.round(255 * (0.85 + 0.15 * overlayBrightness))},` +
            `${Math.round(255 * (0.85 + 0.15 * overlayBrightness))},` +
            `${Math.round(255 * (0.85 + 0.15 * overlayBrightness))})`
          : undefined,
      }}>
      {baseImageUrl && hillshadeView !== 'overlay-only' && (
        <img
          src={baseImageUrl}
          alt={activeTab === 'terrain' ? 'Terrain' : 'Hillshade'}
          style={{ display: 'block', width: '100%' }}
        />
      )}
      {baseImageUrl && hillshadeView === 'overlay-only' && (
        <img
          src={baseImageUrl}
          alt=""
          aria-hidden
          style={{ display: 'block', width: '100%', visibility: 'hidden' }}
        />
      )}

      {vegetationLayersVisible && heightmap && vegetationLayers.map((vl) =>
        vl.visible && vl.dataUrl ? (
          <img
            key={vl.id}
            src={vl.dataUrl}
            alt=""
            aria-hidden
            style={{ display: 'block', width: '100%', position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
          />
        ) : null
      )}

      {showOverlays && contourState && heightmap && !hillshadeGenerating && (
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

          {curvedLabels.filter(l => l.zOrder < 25).sort((a, b) => a.zOrder - b.zOrder).map(label => {
            const pts = label.flip ? [...label.points].reverse() : label.points
            const pathD = catmullRomPath(pts, false)
            const isSelected = selectedItems.some(s => s.type === 'curved-label' && s.id === label.id)
            const hitW = Math.max(label.fontSize * 1.5, 20)
            return (
              <g key={label.id} opacity={label.opacity}>
                <defs><path id={`cl-path-${label.id}`} d={pathD} /></defs>
                <path d={pathD} stroke="transparent" strokeWidth={hitW} fill="none"
                  style={{ cursor: mapTool === 'curved-label' ? 'crosshair' : 'pointer' }}
                  onMouseDown={(e) => { if (mapTool !== 'curved-label') e.stopPropagation() }}
                  onClick={(e) => { if (mapTool === 'curved-label') return; e.stopPropagation(); if (e.shiftKey) shiftSelectItem('curved-label', label.id); else selectItem('curved-label', label.id) }} />
                <text fontFamily={label.fontFamily} fontSize={label.fontSize}
                  fontWeight={label.bold ? 'bold' : 'normal'} fontStyle={label.italic ? 'italic' : 'normal'}
                  fill={label.color} stroke={label.strokeWidth > 0 ? label.strokeColor : 'none'}
                  strokeWidth={label.strokeWidth} paintOrder="stroke fill"
                  dominantBaseline={(label.side === 'right') !== label.flip ? 'hanging' : undefined}
                  style={{ cursor: mapTool === 'curved-label' ? 'crosshair' : 'pointer' }}
                  onMouseDown={(e) => { if (mapTool !== 'curved-label') e.stopPropagation() }}
                  onClick={(e) => { if (mapTool === 'curved-label') return; e.stopPropagation(); if (e.shiftKey) shiftSelectItem('curved-label', label.id); else selectItem('curved-label', label.id) }}>
                  <textPath href={`#cl-path-${label.id}`} startOffset={`${label.startOffset}%`} textAnchor="middle"
                    >{label.text}</textPath>
                </text>
                {isSelected && label.points.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={Math.max(label.fontSize * 0.4, 6)}
                    fill="white" stroke="#0066ff" strokeWidth={2} style={{ cursor: 'grab' }}
                    onMouseDown={(e) => { e.stopPropagation(); labelAnchorDragRef.current = { labelId: label.id, ptIdx: i } }} />
                ))}
              </g>
            )
          })}

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
      {showOverlays && heightmap && (
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

          {/* Curved labels — zOrder 25–49, below roads */}
          {curvedLabels.filter(l => l.zOrder >= 25 && l.zOrder < 50).sort((a, b) => a.zOrder - b.zOrder).map(label => {
            const pts = label.flip ? [...label.points].reverse() : label.points
            const pathD = catmullRomPath(pts, false)
            const isSelected = selectedItems.some(s => s.type === 'curved-label' && s.id === label.id)
            const hitW = Math.max(label.fontSize * 1.5, 20)
            return (
              <g key={label.id} opacity={label.opacity}>
                <defs><path id={`cl-path-${label.id}`} d={pathD} /></defs>
                <path d={pathD} stroke="transparent" strokeWidth={hitW} fill="none"
                  style={{ cursor: mapTool === 'curved-label' ? 'crosshair' : 'pointer' }}
                  onMouseDown={(e) => { if (mapTool !== 'curved-label') e.stopPropagation() }}
                  onClick={(e) => { if (mapTool === 'curved-label') return; e.stopPropagation(); if (e.shiftKey) shiftSelectItem('curved-label', label.id); else selectItem('curved-label', label.id) }} />
                <text fontFamily={label.fontFamily} fontSize={label.fontSize}
                  fontWeight={label.bold ? 'bold' : 'normal'} fontStyle={label.italic ? 'italic' : 'normal'}
                  fill={label.color} stroke={label.strokeWidth > 0 ? label.strokeColor : 'none'}
                  strokeWidth={label.strokeWidth} paintOrder="stroke fill"
                  dominantBaseline={(label.side === 'right') !== label.flip ? 'hanging' : undefined}
                  style={{ cursor: mapTool === 'curved-label' ? 'crosshair' : 'pointer' }}
                  onMouseDown={(e) => { if (mapTool !== 'curved-label') e.stopPropagation() }}
                  onClick={(e) => { if (mapTool === 'curved-label') return; e.stopPropagation(); if (e.shiftKey) shiftSelectItem('curved-label', label.id); else selectItem('curved-label', label.id) }}>
                  <textPath href={`#cl-path-${label.id}`} startOffset={`${label.startOffset}%`} textAnchor="middle"
                    >{label.text}</textPath>
                </text>
                {isSelected && label.points.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={Math.max(label.fontSize * 0.4, 6)}
                    fill="white" stroke="#0066ff" strokeWidth={2} style={{ cursor: 'grab' }}
                    onMouseDown={(e) => { e.stopPropagation(); labelAnchorDragRef.current = { labelId: label.id, ptIdx: i } }} />
                ))}
              </g>
            )
          })}

          {/* ── Water: lakes ──────────────────────────────────────────── */}
          {waterLakesVisible && waterLakes.map((lake) => {
            if (lake.polygon.length < 3) return null
            const isSelected = selectedItems.some(s => s.type === 'water-lake' && s.id === lake.id)
            const d = 'M ' + lake.polygon.map((p) => `${p.x},${p.y}`).join(' L ') + ' Z'
            // Centroid for locator pin
            const cx = lake.polygon.reduce((s, p) => s + p.x, 0) / lake.polygon.length
            const cy = lake.polygon.reduce((s, p) => s + p.y, 0) / lake.polygon.length
            const ph = svgPinScale * 28, phw = svgPinScale * 12, psw = svgPinScale * 1.5
            return (
              <g key={lake.id}>
                <path d={d} fill={lake.color} fillOpacity={lake.opacity} stroke="none"
                  style={{ cursor: 'pointer' }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); if (e.shiftKey) shiftSelectItem('water-lake', lake.id); else selectItem('water-lake', lake.id) }} />
                {isSelected && <>
                  {/* Glow outline */}
                  <path d={d} fill="none" stroke="white" strokeWidth={svgPinScale * 6}
                    style={{ pointerEvents: 'none' }} />
                  <path d={d} fill="none" stroke="#0066ff" strokeWidth={svgPinScale * 3}
                    strokeDasharray={`${svgPinScale * 10} ${svgPinScale * 5}`}
                    style={{ pointerEvents: 'none' }} />
                  {/* Locator pin at centroid */}
                  <g style={{ pointerEvents: 'none' }}>
                    <polygon points={`${cx},${cy} ${cx - phw},${cy - ph} ${cx + phw},${cy - ph}`}
                      fill="none" stroke="white" strokeWidth={psw * 3} strokeLinejoin="round" />
                    <polygon points={`${cx},${cy} ${cx - phw},${cy - ph} ${cx + phw},${cy - ph}`}
                      fill="#ff6600" stroke="none" />
                    <circle cx={cx} cy={cy - ph * 0.55} r={svgPinScale * 5} fill="white" />
                  </g>
                </>}
                {lake.labelPoints && lake.label && (() => {
                  const lp = lake.labelPoints!
                  const lpd = catmullRomPath(lp, false)
                  const lid = `wl-path-${lake.id}`
                  return (
                    <g>
                      <defs><path id={lid} d={lpd} /></defs>
                      <text fontFamily={lake.labelFontFamily} fontSize={lake.labelFontSize}
                        fontWeight={lake.labelBold ? 'bold' : 'normal'}
                        fontStyle={lake.labelItalic ? 'italic' : 'normal'}
                        fill={lake.labelColor}
                        stroke={lake.labelStrokeWidth > 0 ? lake.labelStrokeColor : 'none'}
                        strokeWidth={lake.labelStrokeWidth} paintOrder="stroke fill">
                        <textPath href={`#${lid}`} startOffset="50%" textAnchor="middle">
                          {lake.label}
                        </textPath>
                      </text>
                    </g>
                  )
                })()}
              </g>
            )
          })}

          {/* ── Water: rivers ─────────────────────────────────────────── */}
          {waterRiversVisible && (() => {
            const globalMaxAccum = Math.max(...waterRivers.map(r => r.maxAccumulation), 1)
            return waterRivers.map((river) => {
            const isSelected = selectedItems.some(s => s.type === 'water-river' && s.id === river.id)
            const ph = svgPinScale * 28, phw = svgPinScale * 12, psw = svgPinScale * 1.5
            // Collect locator points: start, 1–2 middle, end
            const allPts = river.segments.flatMap((s) => s.points)
            const locPts = allPts.length > 0 ? (
              allPts.length < 4
                ? [allPts[0], allPts[allPts.length - 1]]
                : [
                    allPts[0],
                    allPts[Math.floor(allPts.length * 0.4)],
                    allPts[Math.floor(allPts.length * 0.7)],
                    allPts[allPts.length - 1],
                  ]
            ) : []
            return (
              <g key={river.id} opacity={river.opacity}>
                {river.segments.map((seg, si) => {
                  if (seg.points.length < 2) return null
                  const d = 'M ' + seg.points.map((p) => `${p.x},${p.y}`).join(' L ')
                  const w = riverBaseStrokeWidth * Math.sqrt(seg.flowAccum / globalMaxAccum)
                  const visW = Math.max(w, 0.5)
                  return (
                    <g key={si}>
                      {/* Wide transparent hit area so thin streams are easy to click */}
                      <path d={d} fill="none" stroke="transparent"
                        strokeWidth={Math.max(visW + 8, 10)} strokeLinecap="round"
                        style={{ cursor: 'pointer' }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); if (e.shiftKey) shiftSelectItem('water-river', river.id); else selectItem('water-river', river.id) }} />
                      <path d={d} fill="none" stroke={river.color}
                        strokeWidth={visW} strokeLinecap="round" strokeLinejoin="round"
                        style={{ pointerEvents: 'none' }} />
                    </g>
                  )
                })}
                {isSelected && <>
                  {/* Glow highlight on all segments */}
                  {river.segments.map((seg, si) => {
                    if (seg.points.length < 2) return null
                    const d = 'M ' + seg.points.map((p) => `${p.x},${p.y}`).join(' L ')
                    const w = riverBaseStrokeWidth * Math.sqrt(seg.flowAccum / globalMaxAccum)
                    return (<g key={`glow-${si}`}>
                      <path d={d} fill="none" stroke="white"
                        strokeWidth={w + svgPinScale * 6} strokeLinecap="round" strokeLinejoin="round"
                        strokeOpacity={0.7} style={{ pointerEvents: 'none' }} />
                      <path d={d} fill="none" stroke="#00aaff"
                        strokeWidth={w + svgPinScale * 2} strokeLinecap="round" strokeLinejoin="round"
                        strokeOpacity={0.8} style={{ pointerEvents: 'none' }} />
                    </g>)
                  })}
                  {/* Locator pins at key points */}
                  {locPts.map((pt, pi) => (
                    <g key={`pin-${pi}`} style={{ pointerEvents: 'none' }}>
                      <polygon points={`${pt.x},${pt.y} ${pt.x - phw},${pt.y - ph} ${pt.x + phw},${pt.y - ph}`}
                        fill="none" stroke="white" strokeWidth={psw * 3} strokeLinejoin="round" />
                      <polygon points={`${pt.x},${pt.y} ${pt.x - phw},${pt.y - ph} ${pt.x + phw},${pt.y - ph}`}
                        fill="#ff6600" stroke="none" />
                      <circle cx={pt.x} cy={pt.y - ph * 0.55} r={svgPinScale * 5} fill="white" />
                    </g>
                  ))}
                </>}
                {river.labelPoints && river.label && (() => {
                  const lpd = catmullRomPath(river.labelPoints!, false)
                  const lid = `wr-path-${river.id}`
                  return (
                    <g>
                      <defs><path id={lid} d={lpd} /></defs>
                      <text fontFamily={river.labelFontFamily} fontSize={river.labelFontSize}
                        fontWeight={river.labelBold ? 'bold' : 'normal'}
                        fontStyle={river.labelItalic ? 'italic' : 'normal'}
                        fill={river.labelColor}
                        stroke={river.labelStrokeWidth > 0 ? river.labelStrokeColor : 'none'}
                        strokeWidth={river.labelStrokeWidth} paintOrder="stroke fill">
                        <textPath href={`#${lid}`} startOffset="50%" textAnchor="middle">
                          {river.label}
                        </textPath>
                      </text>
                    </g>
                  )
                })()}
              </g>
            )
          })
          })()}

          {/* SVG defs: road masks + center paths for textPath */}
          {roads.length > 0 && (
            <defs>
              {roads.map(road => {
                const isSingleLine = road.type === 'footpath' || road.type === 'trail' || road.type === 'steps'
                const maskStrokeW = isSingleLine
                  ? road.type === 'steps' ? road.trackWidth + road.strokeWeight * 2 : road.strokeWeight * 4
                  : road.trackWidth + road.strokeWeight * 2 + road.trackWidth * 0.3
                return (
                  <mask key={road.id} id={`road-mask-${road.id}`} maskUnits="userSpaceOnUse"
                    x={-heightmap.width * 0.1}
                    y={-heightmap.height * 0.1}
                    width={heightmap.width * 1.2}
                    height={heightmap.height * 1.2}>
                    <rect
                      x={-heightmap.width * 0.1}
                      y={-heightmap.height * 0.1}
                      width={heightmap.width * 1.2}
                      height={heightmap.height * 1.2}
                      fill="white" />
                    {roads.filter(r => r.id !== road.id && r.points.length >= 2).map(other => (
                      <path key={other.id}
                        d={catmullRomPath(other.points, other.closed)}
                        stroke="black"
                        strokeWidth={maskStrokeW}
                        fill="none"
                        strokeLinecap="round" />
                    ))}
                  </mask>
                )
              })}
              {roads.filter(r => r.label && r.points.length >= 2).map(road => {
                const isSteps = road.type === 'steps'
                const isSingleLine = road.type === 'footpath' || road.type === 'trail'
                const tw = road.trackWidth, sw = road.strokeWeight
                const fontSize = road.labelFontSize ?? tw * 0.7
                const side = road.labelSide ?? 'left'
                const flip = road.labelFlip ?? false
                const clearance = isSingleLine ? fontSize * 0.6
                  : isSteps ? tw / 2 + fontSize * 0.5
                  : tw / 2 + sw + fontSize * 0.5
                const sideSign = (side === 'right') !== flip ? 1 : -1
                const pts = flip ? [...road.points].reverse() : road.points
                return (
                  <path key={road.id} id={`road-center-${road.id}`}
                    d={catmullRomOffsetPath(pts, road.closed, sideSign * clearance)} />
                )
              })}
            </defs>
          )}

          {/* Roads */}
          {roadsVisible && roads.map(road => {
            if (road.points.length < 2) return null
            const tw = road.trackWidth
            const sw = road.strokeWeight
            const isSteps = road.type === 'steps'
            const isSingleLine = road.type === 'footpath' || road.type === 'trail'
            const half = tw / 2
            const dashArray = road.type === 'dirt'
              ? `${tw * 0.2} ${tw * 0.45}`
              : road.type === 'gravel'
              ? `${tw * 0.9} ${tw * 0.45}`
              : road.type === 'footpath'
              ? `${sw} ${sw * 3}`
              : road.type === 'trail'
              ? `${sw} ${sw * 2} ${sw * 5} ${sw * 2}`
              : undefined
            const isSelected = selectedItems.some(s => s.type === 'road' && s.id === road.id)
            const centerPath = catmullRomPath(road.points, road.closed)
            return (
              <g key={road.id}
                mask={roads.length > 1 ? `url(#road-mask-${road.id})` : undefined}
                opacity={road.opacity}>
                {/* Hit area (transparent wide stroke for click detection) */}
                <path d={centerPath} stroke="transparent" strokeWidth={Math.max(tw + sw * 4, 10)} fill="none"
                  style={{ cursor: mapTool === 'road' ? 'crosshair' : 'pointer' }}
                  onMouseDown={(e) => { if (mapTool !== 'road') e.stopPropagation() }}
                  onClick={(e) => {
                    if (mapTool === 'road') return
                    e.stopPropagation()
                    if (e.shiftKey) shiftSelectItem('road', road.id)
                    else selectItem('road', road.id)
                  }} />
                {isSteps ? (
                  <>
                    {/* Ghost spine — only when selected */}
                    {isSelected && (
                      <path d={centerPath} stroke={road.color} strokeWidth={sw * 0.5} fill="none"
                        strokeDasharray={`${sw * 2} ${sw * 2}`} strokeLinecap="round" strokeOpacity={0.4} />
                    )}
                    {/* Perpendicular hatch marks */}
                    <path
                      d={stepsHatchPath(road.points, road.closed, tw, road.hatchSpacing ?? tw)}
                      stroke={road.color} strokeWidth={sw} fill="none" strokeLinecap="round" />
                  </>
                ) : isSingleLine ? (
                  <path d={centerPath} stroke={road.color} strokeWidth={sw} fill="none"
                    strokeDasharray={dashArray} strokeLinecap="round" />
                ) : (
                  <>
                    <path d={catmullRomOffsetPath(road.points, road.closed, -half)}
                      stroke={road.color} strokeWidth={sw} fill="none"
                      strokeDasharray={dashArray} strokeLinecap="round" />
                    <path d={catmullRomOffsetPath(road.points, road.closed, half)}
                      stroke={road.color} strokeWidth={sw} fill="none"
                      strokeDasharray={dashArray} strokeLinecap="round" />
                  </>
                )}
                {road.label && road.type !== 'footpath' && (
                  <text
                    fontSize={road.labelFontSize ?? tw * 0.7}
                    fontFamily={road.labelFontFamily ?? style.labelFont}
                    fill={road.labelColor ?? road.color}
                    opacity={road.labelOpacity ?? 1}
                    dominantBaseline="middle"
                    textAnchor="middle">
                    <textPath href={`#road-center-${road.id}`} startOffset="50%">
                      {road.label}
                    </textPath>
                  </text>
                )}
                {/* Anchor handles when selected */}
                {isSelected && road.points.map((pt, idx) => (
                  <circle key={idx} cx={pt.x} cy={pt.y} r={tw * 0.4}
                    fill="white" stroke={road.color} strokeWidth={sw * 1.5}
                    style={{ cursor: 'grab' }}
                    onMouseDown={(e) => {
                      e.stopPropagation()
                      roadAnchorDragRef.current = { roadId: road.id, ptIdx: idx }
                    }} />
                ))}
              </g>
            )
          })}

          {/* Elevation flags */}
          {elevationFlagsVisible && elevationFlags.map((flag) => {
            const isDragging = dragPos !== null && dragRef.current?.itemId === flag.id && dragRef.current.type === 'elevation-flag'
            const fx = isDragging ? dragPos!.x : flag.x
            const fy = isDragging ? dragPos!.y : flag.y
            const displayElev = isDragging ? (dragPos!.elevation ?? flag.elevation) : flag.elevation
            const isSelected = selectedItems.some(s => s.type === 'elevation-flag' && s.id === flag.id)
            const s = labelFontSize
            const flagColor = isSelected ? style.majorColor : style.labelColor
            const strokeW = bw(isSelected ? 2 : 1.5, flag.boldness)

            return (
              <g
                key={flag.id}
                opacity={flag.opacity ?? 1}
                onMouseDown={(e) => handleItemMouseDown(e, 'elevation-flag', flag.id)}
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
          {slopeArrowsVisible && slopeArrows.map((arrow) => {
            const isDragging = dragPos !== null && dragRef.current?.itemId === arrow.id && dragRef.current.type === 'slope-arrow'
            const fx = isDragging ? dragPos!.x : arrow.x
            const fy = isDragging ? dragPos!.y : arrow.y
            const displayAngle = isDragging ? (dragPos!.angleDeg ?? arrow.angleDeg) : arrow.angleDeg
            const displaySlope = isDragging ? (dragPos!.slopeDeg ?? arrow.slopeDeg) : arrow.slopeDeg
            const isSelected = selectedItems.some(s => s.type === 'slope-arrow' && s.id === arrow.id)
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
          {ruggednessFlagsVisible && ruggednessFlags.map((flag) => {
            const isDragging = dragPos !== null && dragRef.current?.itemId === flag.id && dragRef.current.type === 'ruggedness-flag'
            const fx = isDragging ? dragPos!.x : flag.x
            const fy = isDragging ? dragPos!.y : flag.y
            const displayTri = isDragging ? (dragPos!.triNorm ?? flag.triNorm) : flag.triNorm
            const isSelected = selectedItems.some(s => s.type === 'ruggedness-flag' && s.id === flag.id)
            const s = labelFontSize
            const severity = getTriSeverity(displayTri)
            const flagColor = ruggednessColorBySeverity ? (ruggednessSeverityColors[severity] ?? TRI_COLORS[severity]) : style.labelColor
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
                {/* Mountain silhouette: elongated V tip + jagged ridgeline */}
                <polygon
                  points={`${fx},${fy} ${fx-s*0.48},${fy-s*0.8} ${fx-s*0.32},${fy-s*1.5} ${fx-s*0.1},${fy-s*0.95} ${fx+s*0.05},${fy-s*1.65} ${fx+s*0.22},${fy-s*1.05} ${fx+s*0.38},${fy-s*1.35} ${fx+s*0.48},${fy-s*0.8}`}
                  fill={flagColor} stroke="rgba(0,0,0,0.4)"
                  strokeWidth={bw(isSelected ? 1.2 : 0.8, flag.boldness)}
                  strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                <text x={fx + s * 0.6} y={fy - s * 0.9}
                  fontSize={labelFontSize} fontFamily={style.labelFont}
                  fontWeight={style.labelBold ? 'bold' : 'normal'}
                  fontStyle={style.labelItalic ? 'italic' : 'normal'}
                  fill={flagColor} dominantBaseline="middle"
                >{triDisplay}</text>
                {isSelected && (
                  <circle cx={fx} cy={fy} r={s * 0.12}
                    fill="none" stroke={flagColor} strokeWidth={2} vectorEffect="non-scaling-stroke" />
                )}
              </g>
            )
          })}

          {/* Swamp markers */}
          {swampMarkersVisible && swampMarkers.map((marker) => {
            const isDragging = dragPos !== null && dragRef.current?.itemId === marker.id && dragRef.current.type === 'swamp-marker'
            const fx = isDragging ? dragPos!.x : marker.x
            const fy = isDragging ? dragPos!.y : marker.y
            const isSelected = selectedItems.some(s => s.type === 'swamp-marker' && s.id === marker.id)
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

          {/* Buildings */}
          {buildingsVisible && buildings.map((building) => {
            const isDragging = dragPos !== null && dragRef.current?.itemId === building.id && dragRef.current.type === 'building'
            const fx = isDragging ? dragPos!.x : building.x
            const fy = isDragging ? dragPos!.y : building.y
            const isSelected = selectedItems.some(s => s.type === 'building' && s.id === building.id)
            const pw = building.widthM * pixelsPerMeter
            const pd = building.depthM * pixelsPerMeter
            const d = buildingPath(building.shape, fx, fy, pw, pd)
            return (
              <g key={building.id}
                opacity={building.opacity}
                transform={building.rotation !== 0 ? `rotate(${building.rotation},${fx},${fy})` : undefined}
                onMouseDown={(e) => handleItemMouseDown(e, 'building', building.id)}
                style={{ cursor: isSelected ? 'grab' : 'pointer' }}>
                <path d={d}
                  fill={building.color} fillOpacity={0.6}
                  stroke={building.color} strokeWidth={1}
                  fillRule={building.shape === 'courtyard' ? 'evenodd' : undefined}
                  vectorEffect="non-scaling-stroke" />
                {isSelected && (
                  <path d={d}
                    fill="none" stroke="white" strokeWidth={2}
                    fillRule={building.shape === 'courtyard' ? 'evenodd' : undefined}
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke" />
                )}
              </g>
            )
          })}

          {/* Points of Interest */}
          {poisVisible && pois.map((poi) => {
            const isDragging = dragPos !== null && dragRef.current?.itemId === poi.id && dragRef.current.type === 'poi'
            const fx = isDragging ? dragPos!.x : poi.x
            const fy = isDragging ? dragPos!.y : poi.y
            const isSelected = selectedItems.some(s => s.type === 'poi' && s.id === poi.id)
            const displayPoi: PoiEntry = { ...poi, x: fx, y: fy }
            const labelSizePx = (poi.labelSizeM ?? 8) * pixelsPerMeter
            const symbolRadius = poi.typeId === 'bridge'
              ? Math.max((poi.bridgeSeparationM ?? 6) * pixelsPerMeter * 0.6 + poi.strokeWeight,
                         (poi.bridgeLengthM ?? 30) * pixelsPerMeter * 0.5)
              : poi.sizeM * pixelsPerMeter * 0.6
            const hitR = Math.max(symbolRadius * 1.1, 8)
            return (
              <g key={poi.id}
                onMouseDown={(e) => handleItemMouseDown(e, 'poi', poi.id)}
                style={{ cursor: isSelected ? 'grab' : 'pointer' }}>
                {/* Transparent hit area — SVG stroked lines have no filled area to click */}
                <circle cx={fx} cy={fy} r={hitR} fill="transparent" />
                {renderPoiSymbol(displayPoi, pixelsPerMeter, customMarkerDefs)}
                {poi.label && (
                  <text
                    x={fx} y={fy + symbolRadius + labelSizePx * 0.3}
                    fontFamily={poi.labelFontFamily ?? 'serif'}
                    fontSize={labelSizePx}
                    fill={poi.labelColor ?? '#2E2412'}
                    textAnchor="middle" dominantBaseline="hanging"
                    style={{ pointerEvents: 'none' }}>
                    {poi.label}
                  </text>
                )}
                {isSelected && (
                  <>
                    <circle cx={fx} cy={fy} r={hitR + 2}
                      fill="none" stroke="rgba(0,0,0,0.55)" strokeWidth={3}
                      vectorEffect="non-scaling-stroke" />
                    <circle cx={fx} cy={fy} r={hitR + 2}
                      fill="none" stroke="white" strokeWidth={1.5} strokeDasharray="5 4"
                      vectorEffect="non-scaling-stroke" />
                  </>
                )}
              </g>
            )
          })}

          {/* Curved labels — zOrder 50–74, above POIs (default band) */}
          {curvedLabels.filter(l => l.zOrder >= 50 && l.zOrder < 75).sort((a, b) => a.zOrder - b.zOrder).map(label => {
            const pts = label.flip ? [...label.points].reverse() : label.points
            const pathD = catmullRomPath(pts, false)
            const isSelected = selectedItems.some(s => s.type === 'curved-label' && s.id === label.id)
            const hitW = Math.max(label.fontSize * 1.5, 20)
            return (
              <g key={label.id} opacity={label.opacity}>
                <defs><path id={`cl-path-${label.id}`} d={pathD} /></defs>
                <path d={pathD} stroke="transparent" strokeWidth={hitW} fill="none"
                  style={{ cursor: mapTool === 'curved-label' ? 'crosshair' : 'pointer' }}
                  onMouseDown={(e) => { if (mapTool !== 'curved-label') e.stopPropagation() }}
                  onClick={(e) => { if (mapTool === 'curved-label') return; e.stopPropagation(); if (e.shiftKey) shiftSelectItem('curved-label', label.id); else selectItem('curved-label', label.id) }} />
                <text fontFamily={label.fontFamily} fontSize={label.fontSize}
                  fontWeight={label.bold ? 'bold' : 'normal'} fontStyle={label.italic ? 'italic' : 'normal'}
                  fill={label.color} stroke={label.strokeWidth > 0 ? label.strokeColor : 'none'}
                  strokeWidth={label.strokeWidth} paintOrder="stroke fill"
                  dominantBaseline={(label.side === 'right') !== label.flip ? 'hanging' : undefined}
                  style={{ cursor: mapTool === 'curved-label' ? 'crosshair' : 'pointer' }}
                  onMouseDown={(e) => { if (mapTool !== 'curved-label') e.stopPropagation() }}
                  onClick={(e) => { if (mapTool === 'curved-label') return; e.stopPropagation(); if (e.shiftKey) shiftSelectItem('curved-label', label.id); else selectItem('curved-label', label.id) }}>
                  <textPath href={`#cl-path-${label.id}`} startOffset={`${label.startOffset}%`} textAnchor="middle"
                    >{label.text}</textPath>
                </text>
                {isSelected && label.points.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={Math.max(label.fontSize * 0.4, 6)}
                    fill="white" stroke="#0066ff" strokeWidth={2} style={{ cursor: 'grab' }}
                    onMouseDown={(e) => { e.stopPropagation(); labelAnchorDragRef.current = { labelId: label.id, ptIdx: i } }} />
                ))}
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

          {/* Road drawing preview */}
          {mapTool === 'road' && inProgressPts.length >= 1 && (() => {
            const previewPts = roadHoverPt
              ? [...inProgressPts, roadHoverPt]
              : inProgressPts
            const tw = heightmap ? heightmap.width * roadDefaults.trackWidthFraction : 10
            const sw = tw * roadDefaults.strokeWeightFraction
            const hs = heightmap ? heightmap.width * roadDefaults.hatchSpacingFraction : tw
            const half = tw / 2
            const isStepsPreview = roadDefaults.type === 'steps'
            const isSingleLine = roadDefaults.type === 'footpath' || roadDefaults.type === 'trail'
            const color = roadDefaults.type === 'dirt' ? roadDefaults.dirtColor
              : roadDefaults.type === 'gravel' ? roadDefaults.gravelColor
              : roadDefaults.type === 'paved' ? roadDefaults.pavedColor
              : roadDefaults.type === 'footpath' ? roadDefaults.footpathColor
              : roadDefaults.type === 'steps' ? roadDefaults.stepsColor
              : roadDefaults.trailColor
            const dashArray = roadDefaults.type === 'dirt'
              ? `${tw * 0.2} ${tw * 0.45}`
              : roadDefaults.type === 'gravel'
              ? `${tw * 0.9} ${tw * 0.45}`
              : roadDefaults.type === 'footpath'
              ? `${sw} ${sw * 3}`
              : roadDefaults.type === 'trail'
              ? `${sw} ${sw * 2} ${sw * 5} ${sw * 2}`
              : undefined
            const closeThreshold = tw * 3

            return (
              <g opacity={0.7} style={{ pointerEvents: 'none' }}>
                {previewPts.length >= 2 && (
                  isStepsPreview ? (
                    <>
                      <path d={catmullRomPath(previewPts, false)}
                        stroke={color} strokeWidth={sw * 0.5} fill="none"
                        strokeDasharray={`${sw * 2} ${sw * 2}`} strokeLinecap="round" strokeOpacity={0.4} />
                      <path d={stepsHatchPath(previewPts, false, tw, hs)}
                        stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
                    </>
                  ) : isSingleLine ? (
                    <path d={catmullRomPath(previewPts, false)}
                      stroke={color} strokeWidth={sw} fill="none"
                      strokeDasharray={dashArray} strokeLinecap="round" />
                  ) : (
                    <>
                      <path d={catmullRomOffsetPath(previewPts, false, -half)}
                        stroke={color} strokeWidth={sw} fill="none"
                        strokeDasharray={dashArray} strokeLinecap="round" />
                      <path d={catmullRomOffsetPath(previewPts, false, half)}
                        stroke={color} strokeWidth={sw} fill="none"
                        strokeDasharray={dashArray} strokeLinecap="round" />
                    </>
                  )
                )}
                {/* Anchor dots */}
                {inProgressPts.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={tw * 0.3}
                    fill={i === 0 ? color : 'white'} stroke={color} strokeWidth={sw} />
                ))}
                {/* Close hint ring */}
                {inProgressPts.length >= 3 && roadHoverPt && (() => {
                  const first = inProgressPts[0]
                  const dist = Math.sqrt((roadHoverPt.x - first.x)**2 + (roadHoverPt.y - first.y)**2)
                  if (dist < closeThreshold) {
                    return <circle cx={first.x} cy={first.y} r={closeThreshold}
                      fill="none" stroke={color} strokeWidth={sw} strokeOpacity={0.5} />
                  }
                  return null
                })()}
              </g>
            )
          })()}

          {/* Road tool — elevation readout beside the crosshair */}
          {mapTool === 'road' && roadHoverPt && roadHoverPt.elevation !== undefined && (() => {
            const s = labelFontSize
            const color = roadDefaults.type === 'dirt' ? roadDefaults.dirtColor
              : roadDefaults.type === 'gravel' ? roadDefaults.gravelColor
              : roadDefaults.type === 'paved' ? roadDefaults.pavedColor
              : roadDefaults.type === 'footpath' ? roadDefaults.footpathColor
              : roadDefaults.type === 'steps' ? roadDefaults.stepsColor
              : roadDefaults.trailColor
            const unitAbbr = elevationCalibration.unitType === 'feet' ? 'ft'
              : elevationCalibration.unitType === 'meters' ? 'm'
              : elevationCalibration.unitType === 'custom' ? (elevationCalibration.customAbbr || '') : ''
            return (
              <text
                x={roadHoverPt.x + s * 0.9}
                y={roadHoverPt.y - s * 0.3}
                fontSize={s}
                fontFamily={style.labelFont}
                fill={color}
                dominantBaseline="middle"
                style={{ pointerEvents: 'none' }}
                opacity={0.85}
              >{roadHoverPt.elevation}{unitAbbr}</text>
            )
          })()}

          {/* Curved label drawing preview */}
          {mapTool === 'curved-label' && inProgressLabelPts.length >= 1 && (() => {
            const previewPts = labelHoverPt ? [...inProgressLabelPts, labelHoverPt] : inProgressLabelPts
            const s = labelFontSize
            return (
              <g opacity={0.7} style={{ pointerEvents: 'none' }}>
                {previewPts.length >= 2 && (
                  <path d={catmullRomPath(previewPts, false)}
                    stroke="#0066ff" strokeWidth={2} fill="none"
                    strokeDasharray="6 4" strokeLinecap="round"
                    vectorEffect="non-scaling-stroke" />
                )}
                {inProgressLabelPts.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={Math.max(s * 0.3, 5)}
                    fill={i === 0 ? '#0066ff' : 'white'} stroke="#0066ff" strokeWidth={2}
                    vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            )
          })()}

          {/* Hover preview — live readout while tool is active, no drag in progress */}
          {toolActive && mapTool !== 'road' && hoverPos && !dragPos && (() => {
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
                  <polygon
                    points={`${hoverPos.x},${hoverPos.y} ${hoverPos.x-s*0.48},${hoverPos.y-s*0.8} ${hoverPos.x-s*0.32},${hoverPos.y-s*1.5} ${hoverPos.x-s*0.1},${hoverPos.y-s*0.95} ${hoverPos.x+s*0.05},${hoverPos.y-s*1.65} ${hoverPos.x+s*0.22},${hoverPos.y-s*1.05} ${hoverPos.x+s*0.38},${hoverPos.y-s*1.35} ${hoverPos.x+s*0.48},${hoverPos.y-s*0.8}`}
                    fill={hoverColor} stroke="rgba(0,0,0,0.3)" strokeWidth={1}
                    strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <text x={hoverPos.x + s * 0.6} y={hoverPos.y - s * 0.9}
                    fontSize={s} fontFamily={style.labelFont}
                    fill={hoverColor} dominantBaseline="middle"
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
            if (mapTool === 'building') {
              const d = buildingDefaultsRef.current
              const tpl = BUILDING_CATALOG.flatMap(g => g.buildings).find(b => b.id === d.buildingTemplateId)
              const shape = tpl?.shape ?? 'rectangle'
              const pw = d.widthM * pixelsPerMeter
              const pd = d.depthM * pixelsPerMeter
              const pathD = buildingPath(shape, hoverPos.x, hoverPos.y, pw, pd)
              return (
                <g opacity={0.7} style={{ pointerEvents: 'none' }}
                  transform={d.rotation !== 0 ? `rotate(${d.rotation},${hoverPos.x},${hoverPos.y})` : undefined}>
                  <path d={pathD}
                    fill={d.color} fillOpacity={0.6}
                    stroke={d.color} strokeWidth={1}
                    fillRule={shape === 'courtyard' ? 'evenodd' : undefined}
                    vectorEffect="non-scaling-stroke" />
                </g>
              )
            }
            if (mapTool === 'poi') {
              const d = poiNewMarkerRef.current
              const hoverEntry: PoiEntry = {
                id: '', x: hoverPos.x, y: hoverPos.y, typeId: d.typeId,
                color: d.color, sizeM: d.sizeM, strokeWeight: d.strokeWeight,
                bridgeLengthM: d.bridgeLengthM, bridgeSeparationM: d.bridgeSeparationM,
                bridgeRotation: d.bridgeRotation, fontFamily: d.fontFamily,
              }
              return <g opacity={0.7}>{renderPoiSymbol(hoverEntry, pixelsPerMeter, customMarkerDefs)}</g>
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

      {/* Grid overlay — on top of all other layers */}
      {showOverlays && grid.enabled && heightmap && innerMapSize && (
        <GridCanvas
          grid={grid}
          measureBar={measureBar}
          calibration={elevationCalibration}
          mapW={innerMapSize.w}
          mapH={innerMapSize.h}
        />
      )}

      {/* Curved labels — zOrder 75–100, above grid */}
      {showOverlays && heightmap && curvedLabels.some(l => l.zOrder >= 75) && (
        <svg
          viewBox={`0 0 ${heightmap.width} ${heightmap.height}`}
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            pointerEvents: mapTool === 'curved-label' ? 'none' : 'auto',
          }}
          onClick={() => clearSelection()}
        >
          {curvedLabels.filter(l => l.zOrder >= 75).sort((a, b) => a.zOrder - b.zOrder).map(label => {
            const pts = label.flip ? [...label.points].reverse() : label.points
            const pathD = catmullRomPath(pts, false)
            const isSelected = selectedItems.some(s => s.type === 'curved-label' && s.id === label.id)
            const hitW = Math.max(label.fontSize * 1.5, 20)
            return (
              <g key={label.id} opacity={label.opacity}>
                <defs><path id={`cl-path-${label.id}`} d={pathD} /></defs>
                <path d={pathD} stroke="transparent" strokeWidth={hitW} fill="none"
                  style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); if (e.shiftKey) shiftSelectItem('curved-label', label.id); else selectItem('curved-label', label.id) }} />
                <text fontFamily={label.fontFamily} fontSize={label.fontSize}
                  fontWeight={label.bold ? 'bold' : 'normal'} fontStyle={label.italic ? 'italic' : 'normal'}
                  fill={label.color} stroke={label.strokeWidth > 0 ? label.strokeColor : 'none'}
                  strokeWidth={label.strokeWidth} paintOrder="stroke fill"
                  dominantBaseline={(label.side === 'right') !== label.flip ? 'hanging' : undefined}
                  style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); if (e.shiftKey) shiftSelectItem('curved-label', label.id); else selectItem('curved-label', label.id) }}>
                  <textPath href={`#cl-path-${label.id}`} startOffset={`${label.startOffset}%`} textAnchor="middle"
                    >{label.text}</textPath>
                </text>
                {isSelected && label.points.map((pt, i) => (
                  <circle key={i} cx={pt.x} cy={pt.y} r={Math.max(label.fontSize * 0.4, 6)}
                    fill="white" stroke="#0066ff" strokeWidth={2}
                    style={{ cursor: 'grab', pointerEvents: 'auto' }}
                    onMouseDown={(e) => { e.stopPropagation(); labelAnchorDragRef.current = { labelId: label.id, ptIdx: i } }} />
                ))}
              </g>
            )
          })}
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
          ruggednessSeverityColors={ruggednessSeverityColors}
          hasSwampMarkers={swampMarkers.length > 0}
          swampMarkerDefaults={swampMarkerDefaults}
          roads={roads}
          roadDefaults={roadDefaults}
          buildings={buildings}
          pois={pois}
          customMarkerDefs={customMarkerDefs}
          elevationCalibration={elevationCalibration}
          ppi={ppi}
          mapW={innerMapSize?.w}
          heightmap={heightmap}
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

      <Modal opened={confirmMultiDeleteOpen} onClose={() => setConfirmMultiDeleteOpen(false)}
        title="Delete selected items?" size="sm">
        <Text size="sm">
          This will permanently delete {selectedItems.length} selected item{selectedItems.length !== 1 ? 's' : ''}.
        </Text>
        <Group mt="md" justify="flex-end">
          <Button variant="default" size="sm" onClick={() => setConfirmMultiDeleteOpen(false)}>Cancel</Button>
          <Button size="sm" color="red" onClick={() => { setConfirmMultiDeleteOpen(false); deleteSelected() }}>Delete</Button>
        </Group>
      </Modal>
    </div>
  )
}
