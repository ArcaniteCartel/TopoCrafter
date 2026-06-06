export type BuildingShape =
  | 'rectangle'
  | 'circle'
  | 'bow-sided'
  | 'apsidal'
  | 'courtyard'
  | 'L-shape'
  | 'U-shape'
  | 'octagon'

export interface BuildingTemplate {
  id: string
  name: string
  shape: BuildingShape
  defaultWidthM: number
  defaultDepthM: number
}

export interface CultureGroup {
  id: string
  label: string
  period: string
  buildings: BuildingTemplate[]
}

export const BUILDING_CATALOG: CultureGroup[] = [
  {
    id: 'neolithic-europe',
    label: 'Neolithic Europe',
    period: '5000–2000 BC',
    buildings: [
      { id: 'ne-longhouse-sm',   name: 'LBK Longhouse (small)',    shape: 'rectangle',  defaultWidthM: 6,    defaultDepthM: 15  },
      { id: 'ne-longhouse-md',   name: 'LBK Longhouse (standard)', shape: 'rectangle',  defaultWidthM: 6,    defaultDepthM: 25  },
      { id: 'ne-longhouse-lg',   name: 'LBK Great Longhouse',      shape: 'rectangle',  defaultWidthM: 7,    defaultDepthM: 40  },
      { id: 'ne-roundhouse-sm',  name: 'Roundhouse (small)',        shape: 'circle',     defaultWidthM: 5.5,  defaultDepthM: 5.5 },
      { id: 'ne-roundhouse-md',  name: 'Roundhouse (standard)',     shape: 'circle',     defaultWidthM: 8,    defaultDepthM: 8   },
      { id: 'ne-roundhouse-lg',  name: 'Roundhouse (chief\'s)',     shape: 'circle',     defaultWidthM: 13,   defaultDepthM: 13  },
    ],
  },
  {
    id: 'mesopotamia',
    label: 'Ancient Mesopotamia',
    period: '3500–500 BC',
    buildings: [
      { id: 'mes-dwelling',      name: 'Single-room dwelling',         shape: 'rectangle', defaultWidthM: 5,   defaultDepthM: 8   },
      { id: 'mes-court-sm',      name: 'Courtyard house (modest)',     shape: 'courtyard', defaultWidthM: 10,  defaultDepthM: 10  },
      { id: 'mes-court-md',      name: 'Courtyard house (Ur)',         shape: 'courtyard', defaultWidthM: 15,  defaultDepthM: 15  },
      { id: 'mes-temple',        name: 'Temple cella',                 shape: 'rectangle', defaultWidthM: 12,  defaultDepthM: 25  },
      { id: 'mes-palace',        name: 'Palace complex',               shape: 'courtyard', defaultWidthM: 150, defaultDepthM: 200 },
    ],
  },
  {
    id: 'egypt',
    label: 'Ancient Egypt',
    period: '3100–30 BC',
    buildings: [
      { id: 'eg-worker',         name: 'Worker terrace house',         shape: 'rectangle', defaultWidthM: 5,   defaultDepthM: 11  },
      { id: 'eg-villa',          name: 'Noble villa (main block)',      shape: 'rectangle', defaultWidthM: 18,  defaultDepthM: 25  },
      { id: 'eg-pylon',          name: 'Temple pylon',                 shape: 'rectangle', defaultWidthM: 113, defaultDepthM: 15  },
      { id: 'eg-hypostyle',      name: 'Great Hypostyle Hall',         shape: 'rectangle', defaultWidthM: 53,  defaultDepthM: 102 },
    ],
  },
  {
    id: 'mycenaean',
    label: 'Bronze Age Aegean / Mycenaean',
    period: '1600–1100 BC',
    buildings: [
      { id: 'myc-megaron-sm',    name: 'Megaron (small)',              shape: 'apsidal',   defaultWidthM: 7,    defaultDepthM: 12  },
      { id: 'myc-megaron-lg',    name: 'Megaron (palace)',             shape: 'apsidal',   defaultWidthM: 15,   defaultDepthM: 25  },
      { id: 'myc-tholos-sm',     name: 'Tholos tomb (small)',          shape: 'circle',    defaultWidthM: 6,    defaultDepthM: 6   },
      { id: 'myc-tholos-lg',     name: 'Tholos (Treasury of Atreus)', shape: 'circle',    defaultWidthM: 14.5, defaultDepthM: 14.5},
    ],
  },
  {
    id: 'celtic',
    label: 'Iron Age / Celtic Europe',
    period: '800 BC–400 AD',
    buildings: [
      { id: 'cel-round-sm',      name: 'Roundhouse (small farm)',      shape: 'circle',    defaultWidthM: 6,   defaultDepthM: 6   },
      { id: 'cel-round-md',      name: 'Roundhouse (standard)',        shape: 'circle',    defaultWidthM: 9,   defaultDepthM: 9   },
      { id: 'cel-round-lg',      name: 'Chieftain\'s roundhouse',      shape: 'circle',    defaultWidthM: 13.5,defaultDepthM: 13.5},
      { id: 'cel-wheelhouse',    name: 'Atlantic wheelhouse',          shape: 'circle',    defaultWidthM: 10,  defaultDepthM: 10  },
      { id: 'cel-enclosure',     name: 'Farmstead enclosure',          shape: 'U-shape',   defaultWidthM: 40,  defaultDepthM: 50  },
    ],
  },
  {
    id: 'greece',
    label: 'Ancient Greece',
    period: '800–146 BC',
    buildings: [
      { id: 'gr-oikos-sm',       name: 'Small oikos',                  shape: 'courtyard', defaultWidthM: 10,  defaultDepthM: 12  },
      { id: 'gr-oikos-pastas',   name: 'Pastas house (Olynthus)',      shape: 'U-shape',   defaultWidthM: 17,  defaultDepthM: 17  },
      { id: 'gr-temple-sm',      name: 'Small temple / treasury',      shape: 'rectangle', defaultWidthM: 5,   defaultDepthM: 10  },
      { id: 'gr-temple-doric',   name: 'Doric temple',                 shape: 'rectangle', defaultWidthM: 14,  defaultDepthM: 32  },
      { id: 'gr-stoa-sm',        name: 'Stoa (small)',                 shape: 'rectangle', defaultWidthM: 6,   defaultDepthM: 40  },
      { id: 'gr-stoa-attalos',   name: 'Stoa of Attalos',             shape: 'rectangle', defaultWidthM: 20,  defaultDepthM: 115 },
    ],
  },
  {
    id: 'roman',
    label: 'Roman',
    period: '300 BC–400 AD',
    buildings: [
      { id: 'rom-taberna',       name: 'Taberna (shop)',               shape: 'rectangle', defaultWidthM: 4.5, defaultDepthM: 7   },
      { id: 'rom-domus-sm',      name: 'Domus (small)',                shape: 'courtyard', defaultWidthM: 15,  defaultDepthM: 20  },
      { id: 'rom-domus-md',      name: 'Domus (medium)',               shape: 'courtyard', defaultWidthM: 18,  defaultDepthM: 35  },
      { id: 'rom-domus-lg',      name: 'Domus (House of the Faun)',    shape: 'courtyard', defaultWidthM: 55,  defaultDepthM: 55  },
      { id: 'rom-insula',        name: 'Insula apartment block',       shape: 'courtyard', defaultWidthM: 20,  defaultDepthM: 20  },
      { id: 'rom-villa-sm',      name: 'Villa rustica (modest)',       shape: 'U-shape',   defaultWidthM: 30,  defaultDepthM: 35  },
      { id: 'rom-villa-lg',      name: 'Villa rustica (working farm)', shape: 'U-shape',   defaultWidthM: 50,  defaultDepthM: 80  },
      { id: 'rom-villa-wing',    name: 'Winged-corridor villa (L)',    shape: 'L-shape',   defaultWidthM: 40,  defaultDepthM: 35  },
    ],
  },
  {
    id: 'viking',
    label: 'Viking / Norse Scandinavia',
    period: '750–1100 AD',
    buildings: [
      { id: 'vik-pithouse',      name: 'Pit-house / workshop',         shape: 'rectangle', defaultWidthM: 4,   defaultDepthM: 5   },
      { id: 'vik-hall-sm',       name: 'Farmstead longhouse',          shape: 'bow-sided', defaultWidthM: 6,   defaultDepthM: 20  },
      { id: 'vik-hall-md',       name: 'Wealthy farmer\'s longhouse',  shape: 'bow-sided', defaultWidthM: 7,   defaultDepthM: 30  },
      { id: 'vik-hall-lg',       name: 'Chieftain\'s hall',            shape: 'bow-sided', defaultWidthM: 10,  defaultDepthM: 50  },
      { id: 'vik-hall-xl',       name: 'Great hall (Borg, Lofoten)',   shape: 'bow-sided', defaultWidthM: 8,   defaultDepthM: 83  },
      { id: 'vik-boathouse-sm',  name: 'Boathouse (small)',            shape: 'rectangle', defaultWidthM: 6,   defaultDepthM: 20  },
      { id: 'vik-boathouse-lg',  name: 'Boathouse (longship)',         shape: 'rectangle', defaultWidthM: 15,  defaultDepthM: 32  },
    ],
  },
  {
    id: 'early-medieval',
    label: 'Early Medieval Europe',
    period: '400–1000 AD',
    buildings: [
      { id: 'em-peasant',        name: 'Peasant longhouse',            shape: 'rectangle', defaultWidthM: 5,   defaultDepthM: 14  },
      { id: 'em-hall-sm',        name: 'Timber hall (small)',          shape: 'bow-sided', defaultWidthM: 5.5, defaultDepthM: 15  },
      { id: 'em-hall-md',        name: 'Estate hall',                  shape: 'bow-sided', defaultWidthM: 8,   defaultDepthM: 22  },
      { id: 'em-hall-royal',     name: 'Royal hall (Yeavering)',       shape: 'bow-sided', defaultWidthM: 8,   defaultDepthM: 25  },
      { id: 'em-hall-cheddar',   name: 'Cheddar Palace great hall',    shape: 'bow-sided', defaultWidthM: 10,  defaultDepthM: 37  },
    ],
  },
  {
    id: 'byzantine',
    label: 'Byzantine',
    period: '330–1453 AD',
    buildings: [
      { id: 'byz-house-sm',      name: 'Urban townhouse',              shape: 'rectangle', defaultWidthM: 8,   defaultDepthM: 15  },
      { id: 'byz-house-lg',      name: 'Courtyard townhouse',          shape: 'courtyard', defaultWidthM: 15,  defaultDepthM: 20  },
      { id: 'byz-basilica',      name: 'Small parish basilica',        shape: 'apsidal',   defaultWidthM: 13,  defaultDepthM: 25  },
      { id: 'byz-cross-church',  name: 'Greek cross church',           shape: 'rectangle', defaultWidthM: 15,  defaultDepthM: 15  },
      { id: 'byz-baptistery',    name: 'Baptistery',                   shape: 'octagon',   defaultWidthM: 12,  defaultDepthM: 12  },
    ],
  },
  {
    id: 'islamic',
    label: 'Medieval Islamic',
    period: '700–1400 AD',
    buildings: [
      { id: 'isl-dar-sm',        name: 'Dar, courtyard house (small)', shape: 'courtyard', defaultWidthM: 10,  defaultDepthM: 12  },
      { id: 'isl-dar-md',        name: 'Dar (medium, Fustat)',         shape: 'courtyard', defaultWidthM: 15,  defaultDepthM: 18  },
      { id: 'isl-dar-lg',        name: 'Dar (wealthy merchant)',       shape: 'courtyard', defaultWidthM: 20,  defaultDepthM: 25  },
      { id: 'isl-caravanserai',  name: 'Caravanserai (Seljuk han)',    shape: 'courtyard', defaultWidthM: 50,  defaultDepthM: 70  },
      { id: 'isl-dome-rock',     name: 'Dome of the Rock',             shape: 'octagon',   defaultWidthM: 55,  defaultDepthM: 55  },
    ],
  },
  {
    id: 'medieval-europe',
    label: 'Medieval Europe',
    period: '1000–1500 AD',
    buildings: [
      { id: 'me-cot-sm',         name: 'One-room cottage',             shape: 'rectangle', defaultWidthM: 5,   defaultDepthM: 8   },
      { id: 'me-cot-md',         name: 'Two-room cottage',             shape: 'rectangle', defaultWidthM: 5,   defaultDepthM: 11  },
      { id: 'me-longhouse',      name: 'Peasant longhouse',            shape: 'rectangle', defaultWidthM: 6,   defaultDepthM: 16  },
      { id: 'me-longhouse-cont', name: 'Continental longhouse',        shape: 'rectangle', defaultWidthM: 7,   defaultDepthM: 22  },
      { id: 'me-manor',          name: 'Manor hall block',             shape: 'L-shape',   defaultWidthM: 8,   defaultDepthM: 18  },
      { id: 'me-burgage',        name: 'Burgage plot building',        shape: 'rectangle', defaultWidthM: 8,   defaultDepthM: 10  },
      { id: 'me-guildhall-sm',   name: 'Guildhall (provincial)',       shape: 'rectangle', defaultWidthM: 11,  defaultDepthM: 25  },
      { id: 'me-guildhall-lg',   name: 'London Guildhall',             shape: 'rectangle', defaultWidthM: 14.6,defaultDepthM: 46  },
      { id: 'me-chapter-house',  name: 'Cathedral chapter house',      shape: 'octagon',   defaultWidthM: 18,  defaultDepthM: 18  },
    ],
  },
  {
    id: 'medieval-japan',
    label: 'Medieval Japan',
    period: '600–1500 AD',
    buildings: [
      { id: 'mj-minka-sm',       name: 'Small peasant minka',          shape: 'rectangle', defaultWidthM: 7,   defaultDepthM: 10  },
      { id: 'mj-minka-md',       name: 'Farm minka',                   shape: 'rectangle', defaultWidthM: 9,   defaultDepthM: 13  },
      { id: 'mj-gassho',         name: 'Gassho-zukuri (Shirakawa)',    shape: 'rectangle', defaultWidthM: 12,  defaultDepthM: 18  },
      { id: 'mj-shinden',        name: 'Shinden hall',                 shape: 'rectangle', defaultWidthM: 11,  defaultDepthM: 17  },
      { id: 'mj-shinden-l',      name: 'Shinden compound (L-wing)',    shape: 'L-shape',   defaultWidthM: 20,  defaultDepthM: 30  },
      { id: 'mj-shinden-u',      name: 'Shinden compound (U)',         shape: 'U-shape',   defaultWidthM: 40,  defaultDepthM: 60  },
      { id: 'mj-shoin',          name: 'Shoin-zukuri mansion',         shape: 'rectangle', defaultWidthM: 14,  defaultDepthM: 20  },
    ],
  },
  {
    id: 'mesoamerica',
    label: 'Pre-Columbian Mesoamerica',
    period: '200–1500 AD',
    buildings: [
      { id: 'meso-maya-comm',    name: 'Maya commoner house',          shape: 'apsidal',   defaultWidthM: 5,   defaultDepthM: 9   },
      { id: 'meso-maya-elite',   name: 'Maya elite range structure',   shape: 'rectangle', defaultWidthM: 10,  defaultDepthM: 20  },
      { id: 'meso-teotihuacan',  name: 'Teotihuacan apartment compound',shape:'courtyard', defaultWidthM: 60,  defaultDepthM: 60  },
    ],
  },
  {
    id: 'renaissance',
    label: 'Renaissance Italy',
    period: '1400–1600 AD',
    buildings: [
      { id: 'ren-tower-house',   name: 'Merchant / tower house',       shape: 'rectangle', defaultWidthM: 8,   defaultDepthM: 13  },
      { id: 'ren-palazzo-sm',    name: 'Small palazzo',                shape: 'courtyard', defaultWidthM: 22,  defaultDepthM: 30  },
      { id: 'ren-palazzo-md',    name: 'Palazzo Rucellai',             shape: 'courtyard', defaultWidthM: 22,  defaultDepthM: 35  },
      { id: 'ren-palazzo-lg',    name: 'Grand palazzo (Medici)',       shape: 'courtyard', defaultWidthM: 40,  defaultDepthM: 45  },
    ],
  },
]
