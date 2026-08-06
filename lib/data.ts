/**
 * Mock catalog + events. In production these come from the CRM (products) and
 * Google Calendar (events). Content is single-language (as the CRM provides it),
 * per the i18n note — we don't promise a translated catalog.
 */

export type Category = {
  slug: string
  label: string
}

export type Product = {
  id: string
  slug: string
  name: string
  artist: string
  price: number
  category: string // category slug
  inStock: boolean
  images: string[]
  description: string
  medium: string
  size: string
  year: number
}

export type PlaiEvent = {
  id: string
  title: string
  start: string // ISO
  location: string
  description: string
}

export const categories: Category[] = [
  { slug: 'painting', label: 'Живопис' },
  { slug: 'graphics', label: 'Графіка' },
  { slug: 'abstract', label: 'Абстракція' },
  { slug: 'landscape', label: 'Пейзаж' },
]

export const products: Product[] = [
  {
    id: 'p1',
    slug: 'nichnyi-priplyv',
    name: 'Нічний приплив',
    artist: 'Оксана Мельник',
    price: 12400,
    category: 'abstract',
    inStock: true,
    images: ['/images/art-01.webp'],
    description:
      'Абстрактна робота у глибоких синіх і вохристих тонах. Густе накладання фарби створює відчуття руху хвиль у темряві. Олія, полотно.',
    medium: 'Олія, полотно',
    size: '80 × 100 см',
    year: 2024,
  },
  {
    id: 'p2',
    slug: 'zolote-pole',
    name: 'Золоте поле',
    artist: 'Андрій Ковальчук',
    price: 9800,
    category: 'landscape',
    inStock: true,
    images: ['/images/art-02.webp'],
    description:
      'Мінімалістичний пейзаж пшеничного поля під широким небом. Тепла золота палітра й спокійний горизонт. Олія, полотно.',
    medium: 'Олія, полотно',
    size: '70 × 90 см',
    year: 2023,
  },
  {
    id: 'p3',
    slug: 'vyshyta',
    name: 'Вишита',
    artist: 'Оксана Мельник',
    price: 15600,
    category: 'painting',
    inStock: true,
    images: ['/images/art-03.webp'],
    description:
      'Фігуративний портрет жінки у вишиванці. Приглушені земляні тони з одним червоним акцентом. Олія, полотно.',
    medium: 'Олія, полотно',
    size: '60 × 80 см',
    year: 2024,
  },
  {
    id: 'p4',
    slug: 'rivnovaha',
    name: 'Рівновага',
    artist: 'Ірина Гнатюк',
    price: 8200,
    category: 'abstract',
    inStock: true,
    images: ['/images/art-04.webp'],
    description:
      'Геометрична композиція з напівпрозорих форм у теракотових, шавлієвих і теплих сірих тонах. Акрил, полотно.',
    medium: 'Акрил, полотно',
    size: '50 × 70 см',
    year: 2024,
  },
  {
    id: 'p5',
    slug: 'polovi-kvity',
    name: 'Польові квіти',
    artist: 'Андрій Ковальчук',
    price: 6400,
    category: 'painting',
    inStock: false,
    images: ['/images/art-05.webp'],
    description:
      'Натюрморт із польовими квітами у керамічній вазі. Вільний живописний мазок і мʼяке денне світло. Олія, полотно.',
    medium: 'Олія, полотно',
    size: '40 × 50 см',
    year: 2022,
  },
  {
    id: 'p6',
    slug: 'tumannyi-obrii',
    name: 'Туманний обрій',
    artist: 'Ірина Гнатюк',
    price: 11200,
    category: 'landscape',
    inStock: true,
    images: ['/images/art-06.webp'],
    description:
      'Атмосферний морський пейзаж, де море зустрічається з небом. Мʼякі градієнти сіро-блакитного й блідо-рожевого. Олія, полотно.',
    medium: 'Олія, полотно',
    size: '80 × 80 см',
    year: 2023,
  },
  {
    id: 'p7',
    slug: 'kvitnevyi-vybukh',
    name: 'Квітневий вибух',
    artist: 'Оксана Мельник',
    price: 13800,
    category: 'abstract',
    inStock: true,
    images: ['/images/art-07.webp'],
    description:
      'Яскрава абстрактна квіткова робота. Енергійні мазки мадженти, помаранчевого й зеленого на світлому тлі. Акрил, полотно.',
    medium: 'Акрил, полотно',
    size: '90 × 120 см',
    year: 2024,
  },
  {
    id: 'p8',
    slug: 'dahy-na-svitanku',
    name: 'Дахи на світанку',
    artist: 'Андрій Ковальчук',
    price: 10600,
    category: 'graphics',
    inStock: true,
    images: ['/images/art-08.webp'],
    description:
      'Тихі міські дахи в сутінках. Живописний міський пейзаж у теплих бурштинових і глибоких індигових тонах. Олія, полотно.',
    medium: 'Олія, полотно',
    size: '60 × 90 см',
    year: 2023,
  },
]

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug)
}

export type Artist = {
  id: string
  slug: string
  name: string
  portrait?: string
  bio: string
}

export const artists: Artist[] = [
  {
    id: 'a1',
    slug: 'oksana-melnyk',
    name: 'Оксана Мельник',
    portrait: '/images/artist-portrait.webp',
    bio: 'Живописиця з Львова. Працює з абстракцією та фігуративом, досліджує памʼять і тілесність через густу фактуру олійної фарби. Учасниця групових виставок у Львові, Києві та Кракові.',
  },
  {
    id: 'a2',
    slug: 'andrii-kovalchuk',
    name: 'Андрій Ковальчук',
    bio: 'Пейзажист і графік. Малює українські краєвиди з натури — від карпатських полонин до міських дахів. Його роботи є у приватних колекціях в Україні, Польщі та Канаді.',
  },
  {
    id: 'a3',
    slug: 'iryna-hnatiuk',
    name: 'Ірина Гнатюк',
    bio: 'Художниця-абстракціоністка. Через геометрію та напівпрозорі шари шукає рівновагу між кольором і тишею. Викладає живопис у студії Плай Піч.',
  },
]

export function productsByArtist(name: string): Product[] {
  return products.filter((p) => p.artist === name)
}

/** Upcoming events, sorted by start date. Stand-in for Google Calendar. */
function daysFromNow(days: number, hour: number, minute = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

export const events: PlaiEvent[] = [
  {
    id: 'e1',
    title: 'Відкриття виставки «Нічний приплив»',
    start: daysFromNow(4, 18),
    location: 'Плай Піч, головна зала',
    description:
      'Урочисте відкриття персональної виставки Оксани Мельник. Знайомство з мисткинею, келих вина та перший погляд на нову серію робіт.',
  },
  {
    id: 'e2',
    title: 'Майстер-клас з акварелі',
    start: daysFromNow(9, 15),
    location: 'Плай Піч, студія',
    description:
      'Дводенний майстер-клас для початківців. Усі матеріали надаємо. Кількість місць обмежена.',
  },
  {
    id: 'e3',
    title: 'Артист-ток: сучасний український пейзаж',
    start: daysFromNow(16, 19),
    location: 'Плай Піч, лекторій',
    description:
      'Розмова з Андрієм Ковальчуком про традицію і сучасність у пейзажному живописі. Вхід вільний.',
  },
  {
    id: 'e4',
    title: 'Недільний живопис для всіх',
    start: daysFromNow(20, 12),
    location: 'Плай Піч, студія',
    description:
      'Розслаблена сесія живопису у неділю. Приходьте з друзями, кава та полотно — за нами.',
  },
  {
    id: 'e5',
    title: 'Вечір графіки та друку',
    start: daysFromNow(34, 18, 30),
    location: 'Плай Піч, майстерня',
    description:
      'Демонстрація технік лінодруку й офорту. Спробуйте зробити власний відбиток разом із митцями.',
  },
]
