import dayjs from 'dayjs';

export const tryParseDate = (date: string | null | undefined) => {
  if (!date) return null;
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return null;
  return parsed;
}

export const minDate = (...dates: Date[]) => new Date(Math.min(...dates.map(d => d.getTime())));
export const maxDate = (...dates: Date[]) => new Date(Math.max(...dates.map(d => d.getTime())));

export const formatDate = (date: Date, format: string): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const map: Record<string, string> = {
    'YYYY': date.getFullYear().toString(),
    'MM': pad(date.getMonth() + 1),
    'DD': pad(date.getDate()),
    'HH': pad(date.getHours()),
    'mm': pad(date.getMinutes()),
    'ss': pad(date.getSeconds()),
  };
  return format.replace(/YYYY|MM|DD|HH|mm|ss/g, matched => map[matched]);
}

export const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}



export const humanizeTime = (date: string | Date | dayjs.Dayjs) => {
  const d = dayjs(date);

  if (d.isSame(dayjs(), 'day')) {
    return 'Today, ' + d.format('HH:mm');
  }

  if (d.isSame(dayjs().subtract(1, 'day'), 'day')) {
    return 'Yesterday, ' + d.format('HH:mm');
  }

  if (d.isSame(dayjs(), 'year')) {
    return d.format('D MMMM');
  }

  return d.format('D MMM YY');
};
