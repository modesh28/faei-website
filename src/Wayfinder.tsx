// "How to reach us": a simple isometric map of the IT faculty with the walk from the main entrance to FAEI,
// plus step cards with photos from the route video. The map is a sketch, not to scale.

const S = 4; // pixels per map unit

function iso(x: number, y: number, z = 0): [number, number] {
  return [(x - y) * 0.866 * S, (x + y) * 0.5 * S - z * S];
}

function pts(list: [number, number, number?][]): string {
  return list.map(([x, y, z]) => iso(x, y, z ?? 0).join(',')).join(' ');
}

type BoxProps = { x0: number; y0: number; x1: number; y1: number; h: number; top: string; left: string; right: string; z0?: number };

// A solid block: top face, the face along y = y1 and the face along x = x1 (the two that face the viewer).
function Box({ x0, y0, x1, y1, h, top, left, right, z0 = 0 }: BoxProps) {
  const z1 = z0 + h;
  return (
    <g>
      <polygon points={pts([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]])} fill={left} />
      <polygon points={pts([[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]])} fill={right} />
      <polygon points={pts([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]])} fill={top} />
    </g>
  );
}

// Faces of a block that faces the viewer: the front (y = const) and the right side (x = const).
function front(y: number, x0: number, x1: number, z0: number, z1: number): string {
  return pts([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]]);
}
function side(x: number, y0: number, y1: number, z0: number, z1: number): string {
  return pts([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]]);
}

function Cypress({ x, y, h = 9 }: { x: number; y: number; h?: number }) {
  const [bx, by] = iso(x, y);
  const [, ty] = iso(x, y, h);
  return <ellipse cx={bx} cy={(by + ty) / 2 - 2} rx={5} ry={(by - ty) / 2 + 2} fill="#3f6e3a" stroke="#2f5a2c" strokeWidth="1" />;
}

function Palm({ x, y, h = 9 }: { x: number; y: number; h?: number }) {
  const [bx, by] = iso(x, y);
  const [tx, ty] = iso(x, y, h);
  return (
    <g>
      <line x1={bx} y1={by} x2={tx} y2={ty} stroke="#7a5a33" strokeWidth="3" />
      {[-60, -20, 20, 60, 180, 140, 220].map((deg) => (
        <ellipse key={deg} cx={tx} cy={ty} rx="11" ry="3" fill="#5f9a4a" transform={`rotate(${deg} ${tx} ${ty}) translate(9 0)`} />
      ))}
    </g>
  );
}

function Tree({ x, y, r = 4 }: { x: number; y: number; r?: number }) {
  const [bx, by] = iso(x, y);
  const [tx, ty] = iso(x, y, 4);
  return (
    <g>
      <line x1={bx} y1={by} x2={tx} y2={ty} stroke="#6b4f2a" strokeWidth="3" />
      <circle cx={tx} cy={ty - r * 2} r={r * 2.6} fill="#6aa553" />
    </g>
  );
}

function Bench({ x, y }: { x: number; y: number }) {
  return <Box x0={x} y0={y} x1={x + 3} y1={y + 0.8} h={0.9} top="#a0743f" left="#3f7a6e" right="#356a5f" />;
}

function Label({ x, y, z = 0, text, size = 13, color = '#182b3a' }: { x: number; y: number; z?: number; text: string; size?: number; color?: string }) {
  const [lx, ly] = iso(x, y, z);
  return <text x={lx} y={ly} textAnchor="middle" fontSize={size} fontWeight={800} fill={color} style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,.9)', strokeWidth: 4 }}>{text}</text>;
}

function StepDot({ x, y, z = 0, n }: { x: number; y: number; z?: number; n: number }) {
  const [cx, cy] = iso(x, y, z);
  return (
    <g>
      <circle cx={cx} cy={cy} r="12" fill="#f4c542" stroke="#182b3a" strokeWidth="2.5" />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="13" fontWeight={900} fill="#182b3a">{n}</text>
    </g>
  );
}

// Faculty block and its front details.
const F = { x0: 20, x1: 68, y0: 16, y1: 52, h: 20 };
const ENTRY = { x0: 40, x1: 48 };

function Faculty() {
  const { x0, x1, y0, y1, h } = F;
  const windowXs: number[] = [];
  for (let x = x0 + 2; x < x1 - 2; x += 4) if (x + 2.4 < ENTRY.x0 - 1 || x > ENTRY.x1 + 1) windowXs.push(x);
  const [sx, sy] = iso((ENTRY.x0 + ENTRY.x1) / 2, y1 + 0.04, h - 2.2);
  return (
    <g>
      <Box x0={x0} y0={y0} x1={x1} y1={y1} h={h} top="#f1ece1" left="#e2d8c4" right="#cbbfa8" />
      {/* solar panels on the roof */}
      <polygon points={pts([[30, 22, h + 0.6], [54, 22, h + 0.6], [54, 40, h + 0.6], [30, 40, h + 0.6]])} fill="#2b4a6b" stroke="#9fb6cc" strokeWidth="1" />
      {[26, 30, 34].map((y) => <path key={y} d={`M${iso(30, y, h + 0.6).join(' ')} L${iso(54, y, h + 0.6).join(' ')}`} stroke="#9fb6cc" strokeWidth="1" />)}
      {[36, 42, 48].map((x) => <path key={x} d={`M${iso(x, 22, h + 0.6).join(' ')} L${iso(x, 40, h + 0.6).join(' ')}`} stroke="#9fb6cc" strokeWidth="1" />)}
      {/* front windows, three floors */}
      {[2.5, 8.5, 14].flatMap((z) => windowXs.map((x) => <polygon key={`${x}-${z}`} points={front(y1, x, x + 2.4, z, z + 3)} fill="#3d5a6c" />))}
      {/* side windows */}
      {[2.5, 8.5, 14].flatMap((z) => [20, 26, 32, 38, 44].map((y) => <polygon key={`s${y}-${z}`} points={side(x1, y, y + 2.4, z, z + 3)} fill="#3a5465" />))}
      {/* entrance tower: lighter stone panel, tall arched glass window, sign band */}
      <polygon points={front(y1 + 0.01, ENTRY.x0 - 1.5, ENTRY.x1 + 1.5, 0, h + 1.2)} fill="#eadfca" stroke="#d4c6ab" strokeWidth="1" />
      <polygon points={front(y1 + 0.02, ENTRY.x0 + 1.6, ENTRY.x1 - 1.6, 6.5, 16.5)} fill="#2f4f63" stroke="#c9b48e" strokeWidth="1.5" />
      {[8.5, 10.5, 12.5, 14.5].map((z) => <path key={z} d={`M${iso(ENTRY.x0 + 1.6, y1 + 0.03, z).join(' ')} L${iso(ENTRY.x1 - 1.6, y1 + 0.03, z).join(' ')}`} stroke="#8fb2c4" strokeWidth="1" />)}
      <path d={`M${iso(44, y1 + 0.03, 6.5).join(' ')} L${iso(44, y1 + 0.03, 16.5).join(' ')}`} stroke="#8fb2c4" strokeWidth="1" />
      <polygon points={front(y1 + 0.03, 32, 56, h - 3.6, h - 0.8)} fill="#f3ecdc" stroke="#cdbd9e" strokeWidth="1" />
      <text transform={`matrix(0.866 0.5 0 1 ${sx} ${sy})`} textAnchor="middle" fontSize="7.5" fontWeight={900} fill="#1f2a30">كلية تكنولوجيا المعلومات</text>
      {/* entrance doors */}
      <polygon points={front(y1 + 0.02, ENTRY.x0 + 1, ENTRY.x1 - 1, 0, 4.5)} fill="#1f3a40" />
    </g>
  );
}

// Steps: n blocks, each one lower than the one behind it.
function Stairs({ x0, x1, yStart, depth, n, rise, color = '#e9e2d2' }: { x0: number; x1: number; yStart: number; depth: number; n: number; rise: number; color?: string }) {
  return (
    <g>
      {Array.from({ length: n }, (_, i) => (
        <Box key={i} x0={x0} x1={x1} y0={yStart + i * depth} y1={yStart + (i + 1) * depth} h={(n - i) * rise} top={color} left="#cfc5b0" right="#bcb09a" />
      ))}
    </g>
  );
}

// Walk: faculty entrance → along the sidewalk → down the cafeteria stairs → wooden canopy (FAEI).
const ROUTE: [number, number][] = [[44, 60], [69.8, 60], [69.8, 30]];
// From the stairs coming down from the upper area, across the road to the entrance.
const ROUTE_TOP: [number, number][] = [[44, 72], [44, 60]];

function routePath(route: [number, number][]): string {
  return route.map(([x, y], i) => `${i ? 'L' : 'M'}${iso(x, y).join(' ')}`).join(' ');
}

function IsoMap() {
  const [pinX, pinY] = iso(71.5, 27, 15);
  const [baseX, baseY] = iso(71.5, 27, 6.5);
  const mainPath = routePath(ROUTE);
  return (
    <svg className="wayfinder-map" viewBox="-255 -20 545 400" role="img" aria-label="خريطة بسيطة: من الدرج اللي بنزل من فوق، اقطع الشارع لمدخل كلية تكنولوجيا المعلومات، امشي على الرصيف يمين، وانزل درج الكافتيريا لحد المظلة الخشبية، وهناك كافتيريا FAEI">
      {/* ground */}
      <polygon points={pts([[0, 0], [100, 0], [100, 100], [0, 100]])} fill="#efe9dc" />
      {/* parking behind the faculty */}
      <polygon points={pts([[22, 2], [72, 2], [72, 13], [22, 13]])} fill="#d9d3c6" />
      <Label x={47} y={7} text="مواقف" size={12} color="#64747c" />
      {/* annex building at the back right */}
      <Box x0={78} y0={4} x1={94} y1={22} h={22} top="#ebe5d8" left="#d6ccb8" right="#c2b7a1" />
      {/* side alley that goes down to FAEI, with steps */}
      <polygon points={pts([[68, 22], [75, 22], [75, 52], [68, 52]])} fill="#b98a74" />
      {Array.from({ length: 9 }, (_, i) => 34 + i * 2).map((y) => <polygon key={y} points={pts([[68, y], [75, y], [75, y + 1], [68, y + 1]])} fill="#e3d3c2" />)}
      {/* FAEI seating area under the wooden canopy */}
      <polygon points={pts([[68, 22], [75, 22], [75, 33], [68, 33]])} fill="#a77b62" />
      <Box x0={68} y0={22} x1={75} y1={33} h={1} z0={5.5} top="#c88a4a" left="#a86f36" right="#94602d" />
      {[24, 28, 32].map((y) => <polygon key={y} points={front(y, 68.4, 68.9, 0, 5.5)} fill="#7a5530" />)}
      <Faculty />
      {/* sidewalk in front of the faculty */}
      <polygon points={pts([[0, 52], [100, 52], [100, 61], [0, 61]])} fill="#e4ddcf" />
      {/* road */}
      <polygon points={pts([[0, 61.6], [100, 61.6], [100, 69.5], [0, 69.5]])} fill="#8f969b" />
      <path d={`M${iso(0, 65.5).join(' ')} L${iso(100, 65.5).join(' ')}`} stroke="#fff" strokeWidth="2" strokeDasharray="10 9" />
      {/* yellow and black curb */}
      <path d={`M${iso(0, 61.3).join(' ')} L${iso(100, 61.3).join(' ')}`} stroke="#f4c542" strokeWidth="4" />
      <path d={`M${iso(0, 61.3).join(' ')} L${iso(100, 61.3).join(' ')}`} stroke="#222" strokeWidth="4" strokeDasharray="8 8" />
      {/* entrance canopy (red tiles) and the faculty steps */}
      <Box x0={ENTRY.x0 - 1} y0={52} x1={ENTRY.x1 + 1} y1={56} h={1.2} z0={5} top="#c4572f" left="#a8462a" right="#93391f" />
      <Stairs x0={ENTRY.x0 + 0.5} x1={ENTRY.x1 - 0.5} yStart={55.5} depth={1.1} n={4} rise={0.4} color="#f6f0e2" />
      {[ENTRY.x0 - 0.5, ENTRY.x1 + 0.3].map((x) => <path key={x} d={`M${iso(x, 55.6).join(' ')} L${iso(x, 55.6, 5).join(' ')}`} stroke="#5b4a3a" strokeWidth="2" />)}
      {/* trees and benches along the front */}
      <Palm x={30} y={53.5} />
      <Palm x={35} y={53.5} />
      {[23, 52, 57, 62].map((x) => <Cypress key={x} x={x} y={53.5} />)}
      {[25, 54, 60].map((x) => <Bench key={x} x={x} y={58.5} />)}
      {/* upper area across the road: terraces and the stairs coming down */}
      <Box x0={4} y0={70.5} x1={40} y1={78} h={1} top="#d6e5c4" left="#d9cfbb" right="#c9bea8" />
      <Box x0={48} y0={70.5} x1={96} y1={78} h={1} top="#d6e5c4" left="#d9cfbb" right="#c9bea8" />
      <Box x0={4} y0={78} x1={40} y1={99} h={2.5} top="#cfe2b8" left="#d9cfbb" right="#c9bea8" />
      <Box x0={48} y0={78} x1={96} y1={99} h={2.5} top="#cfe2b8" left="#d9cfbb" right="#c9bea8" />
      {Array.from({ length: 8 }, (_, i) => (
        <Box key={i} x0={40} x1={48} y0={70.5 + i * 3.5} y1={74 + i * 3.5} h={0.6 + i * 0.6} top="#f6f0e2" left="#b9ad94" right="#a69a80" />
      ))}
      {Array.from({ length: 8 }, (_, i) => (
        <path key={i} d={`M${iso(40, 70.5 + i * 3.5, 0.6 + i * 0.6).join(' ')} L${iso(48, 70.5 + i * 3.5, 0.6 + i * 0.6).join(' ')}`} stroke="#8a7e66" strokeWidth="1.5" />
      ))}
      {[[12, 88], [24, 94], [32, 84], [58, 86], [70, 94], [84, 86], [90, 74]].map(([x, y]) => <Tree key={`${x}-${y}`} x={x} y={y} />)}
      {/* routes */}
      <path d={routePath(ROUTE_TOP)} className="wayfinder-route-alt" />
      <path d={mainPath} className="wayfinder-route-bg" />
      <path d={mainPath} className="wayfinder-route" />
      <circle r="6" fill="#1676b8" stroke="#fff" strokeWidth="2.5">
        <animateMotion dur="5s" repeatCount="indefinite" path={mainPath} />
      </circle>
      {/* labels */}
      <Label x={33} y={88} z={5} text="الدرج من فوق" size={13} />
      <Label x={34} y={59} z={1.5} text="درج الكلية" size={12} />
      <Label x={82} y={46} z={1} text="درج الكافتيريا ↓" size={12} />
      <StepDot x={44} y={60} n={1} />
      <StepDot x={69.8} y={50} n={2} />
      {/* FAEI pin */}
      <g className="wayfinder-pin">
        <line x1={pinX} y1={pinY} x2={baseX} y2={baseY} stroke="#182b3a" strokeWidth="2" strokeDasharray="3 3" />
        <circle cx={pinX} cy={pinY - 26} r="30" fill="#182b3a" stroke="#f4c542" strokeWidth="3" />
        <image href="/images/faei-logo.png" x={pinX - 22} y={pinY - 44} width="44" height="36" preserveAspectRatio="xMidYMid meet" />
        <circle cx={pinX + 24} cy={pinY - 48} r="11" fill="#f4c542" stroke="#182b3a" strokeWidth="2" />
        <text x={pinX + 24} y={pinY - 43} textAnchor="middle" fontSize="12" fontWeight={900} fill="#182b3a">3</text>
      </g>
    </svg>
  );
}

const STEPS = [
  { title: 'وصلت كلية تكنولوجيا المعلومات', text: 'هاد المدخل الرئيسي لكلية الأمير عبدالله بن غازي، اللي فيه المظلة الحمرا.', img: '/images/route/1-faculty.jpg', alt: 'المدخل الرئيسي لكلية تكنولوجيا المعلومات', position: 'center 70%' },
  { title: 'امشي جنب المبنى وانزل الممر', text: 'خليك ماشي جنب حيط الكلية لحد ما تشوف ممر نازل وفوقه مظلة خشب.', img: '/images/route/2-alley.jpg', alt: 'الممر النازل تحت المظلة الخشبية جنب الكلية', position: 'center 60%' },
  { title: 'أهلاً فيك بالفَيّ!', text: 'تحت المظلة الخشبية على طول. اطلب، اقعد، وانبسط.', img: '/images/faei-seating.jpeg', alt: 'القعدة في كافتيريا FAEI', position: 'center' },
];

export default function Wayfinder({ mapsUrl }: { mapsUrl: string }) {
  return (
    <div className="wayfinder" id="location">
      <div className="wayfinder-map-wrap">
        <IsoMap />
        <a className="wayfinder-maps-link" href={mapsUrl} target="_blank" rel="noreferrer" data-testid="link-location">افتح على جوجل ماب</a>
      </div>
      <ol className="wayfinder-steps">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <img src={step.img} alt={step.alt} loading="lazy" style={{ objectPosition: step.position }} />
            <div>
              <span className="wayfinder-num">{i + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
