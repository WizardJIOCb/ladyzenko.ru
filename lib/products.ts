import lectures from './lecture-products.json' with { type: 'json' };
import schoolLectures from './school-products.json' with { type: 'json' };

export type Product = { id: string; kind: string; title: string; amount: number;
  description: string; image?: string; coverImage?:string;accessDays?: number; duration?: string; hiddenUntilConnected?: boolean;modified?:string };
export const consultations: Product[] = [
  { id: 'diagnostic', kind: 'consultation', title: 'Диагностическое интервью', amount: 200000,
    duration: '1 час', description: 'Прояснение запроса, определение эмоциональных ресурсов и поиск вариантов достижения цели.' },
  { id: 'individual', kind: 'consultation', title: 'Индивидуальная консультация', amount: 400000,
    duration: '50 минут', description: 'Работа с личным запросом и жизненной ситуацией. Дату и формат встречи необходимо согласовать до оплаты.' },
  { id: 'testing', kind: 'consultation', title: 'Тестирование', amount: 600000,
    duration: '1 час', description: 'Диагностическое тестирование. Конкретную методику, дату и формат необходимо согласовать до оплаты.' },
];
export const schoolProducts: Product[] = schoolLectures;
export const additionalProducts: Product[] = [{id:'lecture-1794913200000',kind:'lecture',title:'Дополнительная лекция Людмилы Ладыженко',amount:100000,hiddenUntilConnected:true,
  description:'Отдельная запись выступления Людмилы Ладыженко. Продолжительность — 1 час 15 минут. Доступ для личного просмотра на 30 дней.',accessDays:30,duration:'1 ч 15 мин',image:'/stuff/block-3.jpg'},
  {id:'lecture-1793381808567',kind:'lecture',title:'Лекция «Тень»',amount:111100,hiddenUntilConnected:true,
  description:'Полная запись лекции Людмилы Ивановны Ладыженко «Тень». Продолжительность: 1 час 22 минуты. Доступ для личного просмотра на 30 дней после оплаты.',accessDays:30,duration:'1 ч 22 мин'}];
export const lectureProducts: Product[] = [...lectures, ...schoolProducts, ...additionalProducts];
export const products: Product[] = [...consultations, ...lectureProducts];
export const formatPrice = (amount: number) => new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', minimumFractionDigits:amount%100?2:0, maximumFractionDigits:amount%100?2:0 }).format(amount / 100);
