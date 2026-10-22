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

function Tree({ x, y, r = 4 }: { x: number; y: number; r?: number }) {
  const [bx, by] = iso(x, y);
  const [tx, ty] = iso(x, y, 5);
  return (
    <g>
      <line x1={bx} y1={by} x2={tx} y2={ty} stroke="#6b4f2a" strokeWidth="3" />
      <circle cx={tx} cy={ty - r * 2} r={r * 3} fill="#5f9a4a" />
      <circle cx={tx - r} cy={ty - r * 2.6} r={r * 1.6} fill="#76b35c" />
    </g>
  );
}

function Label({ x, y, z = 0, text, size = 13, color = '#182b3a' }: { x: number; y: number; z?: number; text: string; size?: number; color?: string }) {
  const [lx, ly] = iso(x, y, z);
  return <text x={lx} y={ly} textAnchor="middle" fontSize={size} fontWeight={800} fill={color} style={{ paintOrder: 'stroke', stroke: 'rgba(255,255,255,.85)', strokeWidth: 4 }}>{text}</text>;
}

function StepDot({ x, y, n }: { x: number; y: number; n: number }) {
  const [cx, cy] = iso(x, y);
  return (
    <g>
      <circle cx={cx} cy={cy} r="13" fill="#f4c542" stroke="#182b3a" strokeWidth="2.5" />
      <text x={cx} y={cy + 5} textAnchor="middle" fontSize="14" fontWeight={900} fill="#182b3a">{n}</text>
    </g>
  );
}

// Walk: main entrance → along the front → down the side of the building → wooden canopy (FAEI).
const ROUTE: [number, number][] = [[44, 60], [73, 60], [73, 42], [73, 30]];

function routePath(): string {
  return ROUTE.map(([x, y], i) => `${i ? 'L' : 'M'}${iso(x, y).join(' ')}`).join(' ');
}

function IsoMap() {
  const [pinX, pinY] = iso(72, 28, 15);
  return (
    <svg className="wayfinder-map" viewBox="-250 -30 540 400" role="img" aria-label="خريطة بسيطة: من المدخل الرئيسي لكلية تكنولوجيا المعلومات، امشي جنب المبنى لحد المظلة الخشبية، وهناك كافتيريا FAEI">
      {/* ground */}
      <polygon points={pts([[0, 0], [100, 0], [100, 100], [0, 100]])} fill="#efe9dc" />
      {/* parking behind the faculty */}
      <polygon points={pts([[22, 2], [72, 2], [72, 14], [22, 14]])} fill="#d9d3c6" />
      <Label x={47} y={8} text="مواقف" size={12} color="#64747c" />
      {/* road in front of the faculty */}
      <polygon points={pts([[0, 62], [100, 62], [100, 70], [0, 70]])} fill="#8f969b" />
      <path d={`M${iso(0, 66).join(' ')} L${iso(100, 66).join(' ')}`} stroke="#fff" strokeWidth="2" strokeDasharray="10 9" />
      {/* park across the road */}
      <polygon points={pts([[6, 74], [96, 74], [96, 98], [6, 98]])} fill="#cfe2b8" />
      <Label x={52} y={88} text="منتزه شجرة الغالية" size={14} color="#3f6b2e" />
      {/* side alley next to the faculty */}
      <polygon points={pts([[70, 20], [76, 20], [76, 62], [70, 62]])} fill="#c99b86" />
      {/* annex building on the right */}
      <Box x0={76} y0={16} x1={92} y1={44} h={20} top="#e9e3d6" left="#cfc6b3" right="#bdb39e" />
      {/* IT faculty */}
      <Box x0={22} y0={18} x1={70} y1={56} h={16} top="#f1ece1" left="#d8cfbd" right="#c4b9a3" />
      <Label x={40} y={40} z={18} text="كلية تكنولوجيا المعلومات" size={17} />
      {/* main entrance canopy (red tiles) */}
      <Box x0={39} y0={56} x1={49} y1={60} h={1} z0={5} top="#c4572f" left="#a8462a" right="#93391f" />
      {/* FAEI wooden canopy */}
      <Box x0={70} y0={24} x1={76} y1={33} h={1.2} z0={5} top="#c88a4a" left="#a86f36" right="#94602d" />
      {/* trees */}
      {[[14, 80], [24, 92], [36, 78], [64, 92], [80, 80], [90, 92], [92, 52]].map(([x, y]) => <Tree key={`${x}-${y}`} x={x} y={y} />)}
      {/* walking route */}
      <path d={routePath()} className="wayfinder-route-bg" />
      <path d={routePath()} className="wayfinder-route" />
      <circle r="6" fill="#1676b8" stroke="#fff" strokeWidth="2.5">
        <animateMotion dur="5s" repeatCount="indefinite" path={routePath()} />
      </circle>
      <StepDot x={44} y={60} n={1} />
      <StepDot x={73} y={48} n={2} />
      {/* FAEI pin */}
      <g className="wayfinder-pin">
        <line x1={pinX} y1={pinY} x2={iso(72, 28)[0]} y2={iso(72, 28)[1]} stroke="#182b3a" strokeWidth="2" strokeDasharray="3 3" />
        <circle cx={pinX} cy={pinY - 26} r="30" fill="#182b3a" stroke="#f4c542" strokeWidth="3" />
        <image href="/images/faei-logo.png" x={pinX - 22} y={pinY - 44} width="44" height="36" preserveAspectRatio="xMidYMid meet" />
        <circle cx={pinX + 24} cy={pinY - 48} r="11" fill="#f4c542" stroke="#182b3a" strokeWidth="2" />
        <text x={pinX + 24} y={pinY - 43} textAnchor="middle" fontSize="12" fontWeight={900} fill="#182b3a">3</text>
      </g>
      {/* compass hint */}
      <Label x={30} y={66} text="الشارع" size={13} color="#4b5258" />
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
