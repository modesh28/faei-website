// Pickup time on a 12-hour clock: the customer picks the hour and the exact minute.
// The value stays "HH:MM" (24-hour) for the code; only the labels are 12-hour.
import { useState } from 'react';
import { CLOSE_MINUTES, OPEN_MINUTES } from './brand';

const pad = (n: number) => String(n).padStart(2, '0');
const hourLabel = (hour: number) => `${hour % 12 || 12} ${hour < 12 ? 'ص' : 'م'}`;

export default function TimePick({ value, onChange, testId }: { value: string; onChange: (time: string) => void; testId?: string }) {
  const [hour, setHour] = useState(() => (value ? Number(value.split(':')[0]) : -1));
  const [minute, setMinute] = useState(() => (value ? Number(value.split(':')[1]) : -1));
  const hours: number[] = [];
  for (let h = Math.floor(OPEN_MINUTES / 60); h * 60 <= CLOSE_MINUTES; h += 1) hours.push(h);
  const minutes = Array.from({ length: 60 }, (_, m) => m).filter((m) => hour < 0 || (hour * 60 + m >= OPEN_MINUTES && hour * 60 + m <= CLOSE_MINUTES));
  function pick(nextHour: number, nextMinute: number) {
    const fixedMinute = nextHour >= 0 && nextMinute >= 0 && (nextHour * 60 + nextMinute < OPEN_MINUTES || nextHour * 60 + nextMinute > CLOSE_MINUTES) ? -1 : nextMinute;
    setHour(nextHour);
    setMinute(fixedMinute);
    onChange(nextHour >= 0 && fixedMinute >= 0 ? `${pad(nextHour)}:${pad(fixedMinute)}` : '');
  }
  return (
    <span className="time-pick" dir="ltr" data-testid={testId}>
      <select value={hour} onChange={(event) => pick(Number(event.target.value), minute)} aria-label="الساعة">
        <option value={-1}>الساعة</option>
        {hours.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
      </select>
      <b>:</b>
      <select value={minute} onChange={(event) => pick(hour, Number(event.target.value))} aria-label="الدقيقة">
        <option value={-1}>الدقيقة</option>
        {minutes.map((m) => <option key={m} value={m}>{pad(m)}</option>)}
      </select>
    </span>
  );
}
