export type Locale = 'uk' | 'en'

/** Ukrainian counts take three forms: 1 робота, 2–4 роботи, 5+ робіт. */
function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 14) return many
  const mod10 = n % 10
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

export const dictionaries = {
  uk: {
    nav: {
      shop: 'Крамничка',
      events: 'Події',
      about: 'Про нас',
      artists: 'Митці',
      cart: 'Кошик',
      menu: 'Меню',
      close: 'Закрити',
    },
    landing: {
      heroTitle: 'Простір, де мистецтво живе поруч із вами.',
      heroLead:
        'Плай Піч — арт-центр і крамничка сучасного українського мистецтва. Приходьте дивитися, залишайтеся творити, забирайте роботи додому.',
      heroCtaShop: 'До крамнички',
      heroCtaEvents: 'Найближчі події',
      eventsTitle: 'Найближчі події',
      eventsAll: 'Усі події',
      featuredTitle: 'Вибрані роботи',
      featuredAll: 'Уся крамничка',
      aboutTitle: 'Місце, а не лише вітрина',
      aboutBody:
        'Ми відкрили Плай Піч, щоб мистецтво було не за склом, а поруч — у розмовах, майстер-класах і чашці кави. Тут виставляються митці, народжуються ідеї та знаходять дім нові роботи.',
      aboutCta: 'Дізнатися більше',
    },
    shop: {
      title: 'Крамничка',
      lead: 'Оригінальні роботи українських митців. Кожна — єдина.',
      searchPlaceholder: 'Пошук робіт…',
      all: 'Усі',
      emptyTitle: 'Нічого не знайшли',
      emptyBody: 'Спробуйте інший запит або очистіть фільтри.',
      clear: 'Очистити фільтри',
      inStock: 'В наявності',
      soldOut: 'Продано',
      addToCart: 'Додати в кошик',
      viewWork: 'Переглянути',
      backToShop: 'До крамнички',
      description: 'Опис',
      details: 'Деталі',
      size: 'Розмір',
      moreByArtist: 'Інші роботи митця',
      lastOne: 'Остання',
      availableOnly: 'Лише в наявності',
      showMore: 'Показати ще',
      sortLabel: 'Сортування',
      sort: {
        default: 'Спочатку нові',
        priceAsc: 'Спочатку дешевші',
        priceDesc: 'Спочатку дорожчі',
      },
      resultCount: (n: number) => `${n} ${plural(n, 'робота', 'роботи', 'робіт')}`,
    },
    events: {
      title: 'Події',
      lead: 'Виставки, майстер-класи та зустрічі в Плай Піч.',
      register: 'Записатись',
      addToCalendar: 'Додати в календар',
      location: 'Локація',
    },
    about: {
      title: 'Про нас',
      lead: 'Плай Піч — простір, де сучасне українське мистецтво живе поруч із людьми.',
      body1:
        'Ми відкрили Плай Піч, щоб мистецтво було не за склом, а поруч — у розмовах, майстер-класах і чашці кави. Тут виставляються митці, народжуються ідеї та знаходять дім нові роботи.',
      body2:
        'У нашій крамничці — лише оригінальні роботи. Кожна купівля напряму підтримує митця і допомагає простору жити далі: проводити виставки, події та відкриті студії.',
      ctaArtists: 'Познайомитися з митцями',
      ctaEvents: 'Найближчі події',
      artistsTitle: 'Митці',
      artistsLead: 'Люди, чиї роботи живуть у нашому просторі.',
      selectedWorks: 'Вибрані роботи',
      viewInShop: 'Дивитися в крамничці',
      allArtists: 'Усі митці',
      backToArtists: 'До митців',
      worksCount: (n: number) => `${n} ${plural(n, 'робота', 'роботи', 'робіт')}`,
      artistWorks: 'Роботи',
    },
    cart: {
      title: 'Кошик',
      empty: 'Кошик порожній',
      emptyBody: 'Додайте роботу, яка вам до душі.',
      subtotal: 'Разом',
      checkout: 'Оформити',
      continue: 'Далі до крамнички',
      remove: 'Прибрати',
      increase: 'Збільшити кількість',
      decrease: 'Зменшити кількість',
    },
    checkout: {
      title: 'Оформлення',
      contact: 'Контактні дані',
      name: 'Імʼя та прізвище',
      email: 'Email',
      phone: 'Телефон',
      delivery: 'Доставка',
      city: 'Місто',
      address: 'Відділення / адреса',
      payment: 'Оплата',
      paymentStub: 'Онлайн-оплату буде додано незабаром. Ми звʼяжемося з вами, щоб узгодити оплату та доставку.',
      summary: 'Ваше замовлення',
      place: 'Підтвердити замовлення',
      required: 'Обовʼязкове поле',
      invalidEmail: 'Некоректний email',
      successTitle: 'Дякуємо!',
      successBody: 'Ваше замовлення прийнято. Ми звʼяжемося з вами найближчим часом, щоб узгодити оплату та доставку.',
      orderNumber: 'Номер замовлення',
      errorUnavailable: 'На жаль, роботу вже придбали. Поверніться до кошика й приберіть її, щоб оформити решту.',
      errorRepriced: 'Ціна змінилася, поки ви оформлювали замовлення. Поверніться до кошика — ми покажемо актуальну ціну.',
      errorGeneric: 'Не вдалося оформити замовлення. Спробуйте ще раз або звʼяжіться з нами.',
    },
    notFound: {
      title: 'Сторінку не знайдено',
      body: 'Такої сторінки не існує або її було переміщено.',
      home: 'На головну',
    },
    errorPage: {
      title: 'Щось пішло не так',
      body: 'Сталася помилка. Спробуйте оновити сторінку.',
      retry: 'Спробувати знову',
    },
    footer: {
      tagline: 'Арт-центр і крамничка сучасного українського мистецтва.',
      visit: 'Завітайте',
      hours: 'Години роботи',
      hoursValue: 'Вт–Нд, 11:00–20:00',
      follow: 'Ми в мережі',
      nav: 'Навігація',
      rights: 'Усі права захищено.',
    },
  },
  en: {
    nav: {
      shop: 'Shop',
      events: 'Events',
      about: 'About',
      artists: 'Artists',
      cart: 'Cart',
      menu: 'Menu',
      close: 'Close',
    },
    landing: {
      heroTitle: 'A place where art lives right beside you.',
      heroLead:
        'Plai Pich is an art center and shop for contemporary Ukrainian art. Come to look, stay to create, take the work home.',
      heroCtaShop: 'Visit the shop',
      heroCtaEvents: 'Upcoming events',
      eventsTitle: 'Upcoming events',
      eventsAll: 'All events',
      featuredTitle: 'Selected works',
      featuredAll: 'Browse the shop',
      aboutTitle: 'A place, not just a storefront',
      aboutBody:
        'We opened Plai Pich so art would live beside you — in conversations, workshops and a cup of coffee. Artists exhibit here, ideas take shape, and new works find a home.',
      aboutCta: 'Learn more',
    },
    shop: {
      title: 'Shop',
      lead: 'Original works by Ukrainian artists. Each one unique.',
      searchPlaceholder: 'Search works…',
      all: 'All',
      emptyTitle: 'Nothing found',
      emptyBody: 'Try another search or clear the filters.',
      clear: 'Clear filters',
      inStock: 'In stock',
      soldOut: 'Sold',
      addToCart: 'Add to cart',
      viewWork: 'View',
      backToShop: 'Back to shop',
      description: 'Description',
      details: 'Details',
      size: 'Size',
      moreByArtist: 'More by this artist',
      lastOne: 'Last one',
      availableOnly: 'In stock only',
      showMore: 'Show more',
      sortLabel: 'Sort',
      sort: {
        default: 'Newest first',
        priceAsc: 'Price: low to high',
        priceDesc: 'Price: high to low',
      },
      resultCount: (n: number) => `${n} ${n === 1 ? 'work' : 'works'}`,
    },
    events: {
      title: 'Events',
      lead: 'Exhibitions, workshops and gatherings at Plai Pich.',
      register: 'Register',
      addToCalendar: 'Add to calendar',
      location: 'Location',
    },
    about: {
      title: 'About',
      lead: 'Plai Pich is a place where contemporary Ukrainian art lives right beside people.',
      body1:
        'We opened Plai Pich so art would live beside you — in conversations, workshops and a cup of coffee. Artists exhibit here, ideas take shape, and new works find a home.',
      body2:
        'Our shop carries original works only. Every purchase directly supports the artist and keeps the space alive — running exhibitions, events and open studios.',
      ctaArtists: 'Meet the artists',
      ctaEvents: 'Upcoming events',
      artistsTitle: 'Artists',
      artistsLead: 'The people whose works live in our space.',
      selectedWorks: 'Selected works',
      viewInShop: 'View in shop',
      allArtists: 'All artists',
      backToArtists: 'Back to artists',
      worksCount: (n: number) => `${n} ${n === 1 ? 'work' : 'works'}`,
      artistWorks: 'Works',
    },
    cart: {
      title: 'Cart',
      empty: 'Your cart is empty',
      emptyBody: 'Add a work you love.',
      subtotal: 'Subtotal',
      checkout: 'Checkout',
      continue: 'Continue to shop',
      remove: 'Remove',
      increase: 'Increase quantity',
      decrease: 'Decrease quantity',
    },
    checkout: {
      title: 'Checkout',
      contact: 'Contact details',
      name: 'Full name',
      email: 'Email',
      phone: 'Phone',
      delivery: 'Delivery',
      city: 'City',
      address: 'Branch / address',
      payment: 'Payment',
      paymentStub: 'Online payment is coming soon. We will contact you to arrange payment and delivery.',
      summary: 'Your order',
      place: 'Place order',
      required: 'Required field',
      invalidEmail: 'Invalid email',
      successTitle: 'Thank you!',
      successBody: 'Your order has been received. We will be in touch shortly to arrange payment and delivery.',
      orderNumber: 'Order number',
      errorUnavailable: 'That work has just been sold. Go back to the cart and remove it to order the rest.',
      errorRepriced: 'The price changed while you were checking out. Go back to the cart to see the current price.',
      errorGeneric: 'We could not place the order. Please try again or get in touch.',
    },
    notFound: {
      title: 'Page not found',
      body: 'This page does not exist or has been moved.',
      home: 'Back home',
    },
    errorPage: {
      title: 'Something went wrong',
      body: 'An error occurred. Try reloading the page.',
      retry: 'Try again',
    },
    footer: {
      tagline: 'An art center and shop for contemporary Ukrainian art.',
      visit: 'Visit us',
      hours: 'Opening hours',
      hoursValue: 'Tue–Sun, 11:00–20:00',
      follow: 'Follow us',
      nav: 'Navigation',
      rights: 'All rights reserved.',
    },
  },
} as const

type DeepString<T> = {
  [K in keyof T]: T[K] extends string
    ? string
    : // Counters are functions, not leaves — keep their signature callable.
      T[K] extends (...args: never[]) => string
      ? T[K]
      : DeepString<T[K]>
}

/** Structural shape of the uk dictionary — both locales must match it. */
export type Dictionary = DeepString<(typeof dictionaries)['uk']>
