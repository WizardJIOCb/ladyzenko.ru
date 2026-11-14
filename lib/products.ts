import lectures from './lecture-products.json' with { type: 'json' };

export type Product = { id: string; kind: string; title: string; amount: number;
  description: string; image?: string; accessDays?: number; duration?: string };
export const consultations: Product[] = [
  { id: 'diagnostic', kind: 'consultation', title: 'Диагностическое интервью', amount: 200000,
    duration: '1 час', description: 'Прояснение запроса, определение эмоциональных ресурсов и поиск вариантов достижения цели.' },
  { id: 'individual', kind: 'consultation', title: 'Индивидуальная консультация', amount: 400000,
    duration: '50 минут', description: 'Работа с личным запросом и жизненной ситуацией. Дату и формат встречи необходимо согласовать до оплаты.' },
  { id: 'testing', kind: 'consultation', title: 'Тестирование', amount: 600000,
    duration: '1 час', description: 'Диагностическое тестирование. Конкретную методику, дату и формат необходимо согласовать до оплаты.' },
];
export const lectureProducts: Product[] = lectures;
export const products: Product[] = [...consultations, ...lectureProducts];
export const formatPrice = (amount: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(amount / 100);
