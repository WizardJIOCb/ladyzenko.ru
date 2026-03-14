import type { Metadata } from "next";
import Link from "next/link";
import { RestartableGif } from "@/components/restartable-gif";
import { getArticlePages, getHomeData, getLecturePages, getPageBySlug } from "@/lib/content";

export const metadata: Metadata = {
  title: "Людмила Ладыженко | Психолог",
  description: "Психолог Людмила Ладыженко: лекции, статьи, консультации, видео и материалы.",
};

const services = [
  {
    title: "Диагностическое интервью",
    items: [
      "Прояснение запроса",
      "Определение эмоциональных ресурсов для решения поставленной задачи",
      "Поиск вариантов достижения цели",
    ],
    duration: "1 час",
  },
  {
    title: "Индивидуальная консультация",
    items: [
      "Расширение вариантов выхода из создавшейся ситуации",
      "Прояснение конструкта личности",
      "Работа с личной историей как с ресурсной платформой для изменений",
    ],
    duration: "50 мин.",
  },
  {
    title: "Тестирование (тест Госстандарт России, Санкт-Петербург)",
    items: [
      "Гимназия или обычная школа? Готовность к школе и мягкая адаптация ребёнка",
      "Диагностика трудностей в обучении с 6 до 17 лет",
      "Тест на выбор профессии и личностных особенностей",
      "Тест врождённых и приобретённых черт характера",
      "Тест на уровень агрессии прямой и косвенной",
    ],
    duration: "1 час",
  },
];

const lecturePrices = ["1100 р.", "1000 р.", "1000 р.", "1100 р.", "500 р.", "500 р.", "500 р.", "500 р."];
const lectureOldPrice = "3000 р.";

const mediaCards = [
  {
    title: "Аудио-книга «МамаЖизнь или Мамотайм. Как отдать своему ребёнку всё и сохранить себя?»",
    text:
      "Это книга для взрослых, про ваш сценарий жизни и гарантийный талон на счастливую жизнь вашего ребёнка. Я делюсь наблюдениями о том, как воспитание влияет на дальнейшую жизнь.",
    image: "/stuff/block-9.jpg",
    wide: true,
  },
  {
    title: "Разбор фильма «Весь этот мир»",
    text: "Глубокие размышления и практические советы. С юмором о важном в нашей жизни.",
    image: "/stuff/block-3.jpg",
  },
  {
    title: "Видео о подарках",
    text: "Короткие ролики и размышления о привязанности, отношениях и жизни.",
    image: "/stuff/block-1.jpg",
  },
];

function toWhatsappLink(text: string) {
  return `https://api.whatsapp.com/send/?phone=79177542323&text=${encodeURIComponent(text)}&type=phone_number&app_absent=0`;
}

export default function HomePage() {
  const home = getHomeData();
  const aboutPage = getPageBySlug("obo_mne");
  const photoPage = getPageBySlug("foto");
  const diplomaPage = getPageBySlug("diplom");
  const videoPage = getPageBySlug("video");
  const lecturePages = getLecturePages().slice(0, 8);
  const featuredLecturePages = getLecturePages().slice(0, 2);
  const articlePages = getArticlePages().slice(0, 12);
  const newsImages = (photoPage?.images.length ? photoPage.images : ["/stuff/black-2.jpg"]).slice(0, 12);
  const diplomaImages = (diplomaPage?.images.length ? diplomaPage.images : ["/stuff/block-1.jpg"]).slice(0, 10);
  const aboutSections = [
    { title: "Моя история", content: home.about, open: true },
    { title: "Я могу помочь, если ...", content: home.helpsWith, open: false },
    { title: "Как я работаю", content: home.workFormats, open: false },
  ];
  const footerContacts = [
    { label: "Телефон", href: "tel:+79177542323", kind: "blue" },
    { label: "Email", href: "mailto:ladyzenko@mail.ru", kind: "blue-light" },
    { label: "WhatsApp", href: "https://wa.me/79177542323", kind: "green" },
    { label: "Канал в Телеграм", href: "https://t.me/psy_ladyzenko", kind: "blue-light" },
    { label: "Написать в ВК", href: "https://vk.com/app5898182_-77886543#s=2454637", kind: "gray" },
    { label: "Группа в ВК", href: "https://vk.com/mamotime", kind: "gray" },
  ];

  return (
    <div className="clone-home">
      <section className="hero-tilda" id="top">
        <div className="t-cover">
          <div className="t-cover__carrier" />
          <div className="t-cover__filter" />
          <div className="t-container">
            <div className="t-col t-col_12">
              <div className="t-cover__wrapper t-valign_middle">
                <div className="t001 t-align_center">
                  <div className="t001__wrapper" data-hook-content="covercontent">
                    <RestartableGif className="hero-tilda__lamp" src="/old-site/hero-lamp.gif" alt="Lamp" />
                    <div className="t001__title t-title t-title_xl">
                      <div className="hero-tilda__titlebox">
                        <span className="hero-tilda__uptitle">Привет, я — психолог</span>
                        <br />
                        <strong className="hero-tilda__name">ЛЮДМИЛА</strong>
                        <br />
                        <span className="hero-tilda__subtitle">Ивановна Ладыженко</span>
                      </div>
                    </div>
                    <span className="space" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <a className="t-cover__arrow" href="#about" aria-label="Перейти к разделу Обо мне">
            <div className="t-cover__arrow-wrapper t-cover__arrow-wrapper_animated">
              <div className="t-cover__arrow_mobile">
                <svg className="t-cover__arrow-svg" x="0px" y="0px" width="38.417px" height="18.592px" viewBox="0 0 38.417 18.592" aria-hidden="true">
                  <g>
                    <path d="M19.208,18.592c-0.241,0-0.483-0.087-0.673-0.261L0.327,1.74c-0.408-0.372-0.438-1.004-0.066-1.413c0.372-0.409,1.004-0.439,1.413-0.066L19.208,16.24L36.743,0.261c0.411-0.372,1.042-0.342,1.413,0.066c0.372,0.408,0.343,1.041-0.065,1.413L19.881,18.332C19.691,18.505,19.449,18.592,19.208,18.592z" />
                  </g>
                </svg>
              </div>
            </div>
          </a>
        </div>
      </section>

      <section className="clone-section clone-section--narrow" id="about">
        <div className="clone-heading clone-heading--compact">
          <h2 className="clone-title">Обо мне</h2>
        </div>
        <div className="accordion-list">
          {aboutSections.map((section) => (
            <details className="accordion-item" key={section.title} open={section.open}>
              <summary>{section.title}</summary>
              <div className="accordion-item__content">
                {section.content.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="clone-section clone-section--wide" id="news">
        <div className="clone-heading">
          <h2 className="clone-title">Новости, встречи, лекции</h2>
          <p>Где меня можно встретить, поговорить, поучаствовать, задать вопросы, и с юмором узнать о важном</p>
        </div>
        <div className="news-mosaic">
          {newsImages.map((image, index) => (
            <div className="news-mosaic__item" key={`${image}-${index}`}>
              <img src={image} alt="" />
            </div>
          ))}
        </div>
      </section>

      <section className="clone-section clone-section--narrow" id="certificates">
        <h2 className="clone-title">Дипломы и сертификаты</h2>
        <div className="certificate-showcase">
          <div className="certificate-showcase__main">
            <img src={diplomaImages[0]} alt="Диплом или сертификат" />
          </div>
          <div className="certificate-showcase__thumbs">
            {diplomaImages.slice(0, 9).map((image, index) => (
              <div className="certificate-showcase__thumb" key={`${image}-${index}`}>
                <img src={image} alt="" />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="clone-section clone-section--narrow" id="school">
        <div className="clone-heading clone-heading--school">
          <h2 className="clone-title">Описание лекций первой "Школы Отцов и заинтересованных взрослых"</h2>
          <p>Доступны 13 лекций, которые даруют поддержку, знания и вдохновение ответственным родителям и не только...</p>
        </div>
        <div className="lecture-feature-list">
          {featuredLecturePages.map((lecture, index) => (
            <article className="lecture-feature" key={lecture.slug}>
              <div className="lecture-feature__media">
                <button className="lecture-feature__nav lecture-feature__nav--left" type="button" aria-label="Предыдущий слайд">
                  ‹
                </button>
                <img src={lecture.images[0] || newsImages[index] || "/stuff/block-3.jpg"} alt={lecture.title} />
                <button className="lecture-feature__play" type="button" aria-label="Смотреть промо">
                  ▶
                </button>
                <button className="lecture-feature__nav lecture-feature__nav--right" type="button" aria-label="Следующий слайд">
                  ›
                </button>
              </div>
              <div className="lecture-feature__dots" aria-hidden="true">
                <span className="is-active" />
                <span />
                <span />
                <span />
                <span />
              </div>
              <div className="lecture-feature__copy">
                <h3>{lecture.title}</h3>
                <p>{lecture.excerpt}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="clone-cta-wrap">
          <a className="clone-cta clone-cta--green" href={toWhatsappLink("Здравствуйте, хочу приобрести лекции школы отцов.")} target="_blank" rel="noreferrer">
            Как приобрести лекции школы отцов?
          </a>
        </div>
      </section>

      <section className="clone-section clone-section--narrow" id="services">
        <h2 className="clone-title">Услуги</h2>
        <div className="services-list">
          {services.map((service) => (
            <article className="service-row" key={service.title}>
              <h3>{service.title}</h3>
              <ul>
                {service.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="service-row__duration">{service.duration}</p>
            </article>
          ))}
        </div>
        <div className="clone-cta-wrap">
          <a
            className="clone-cta clone-cta--green"
            href={toWhatsappLink("Здравствуйте, хочу записаться на консультацию.")}
            target="_blank"
            rel="noreferrer"
          >
            Записаться на консультации
          </a>
        </div>
      </section>

      <section className="clone-section clone-section--narrow" id="ask">
        <div className="question-box">
          <h2 className="clone-title">Задать вопрос</h2>
          <p>
            Остались вопросы?
            <br />
            Напишите мне в WhatsApp или любой другой мессенджер
            <br />и я обязательно Вам отвечу!
          </p>
          <a
            className="clone-cta clone-cta--green clone-cta--shine"
            href={toWhatsappLink("Здравствуйте, хотелось бы задать Вам вопрос")}
            target="_blank"
            rel="noreferrer"
          >
            Написать в WhatsApp
          </a>
        </div>
      </section>

      <section className="clone-section clone-section--wide" id="lectures">
        <div className="clone-heading clone-heading--catalog">
          <h2 className="clone-title">Лекции в записях</h2>
          <p>
            По вопросам приобретения лекций пишите в{" "}
            <a href={toWhatsappLink("Здравствуйте, хочу приобрести Вашу лекцию...")}>WhatsApp</a>
          </p>
        </div>
        <div className="lecture-grid">
          {lecturePages.map((lecture, index) => (
            <article className="lecture-card" key={lecture.slug}>
              <div className="lecture-card__image">
                <img src={lecture.images[0] || newsImages[index] || "/stuff/block-3.jpg"} alt={lecture.title} />
                <span className={`lecture-card__badge ${index < 3 ? "is-sale" : "is-new"}`}>{index < 3 ? "SALE" : "NEW"}</span>
              </div>
              <h3>{lecture.title}</h3>
              <Link href={lecture.path}>Читать описание...</Link>
              <p className="lecture-card__price">
                <span>{lecturePrices[index] || "500 р."}</span>
                <s>{lectureOldPrice}</s>
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="clone-section clone-section--wide" id="articles">
        <h2 className="clone-title">Статьи и публикации</h2>
        <div className="article-grid">
          {articlePages.map((article, index) => (
            <article className={`article-card ${index < 4 ? "article-card--feature" : ""}`} key={article.slug}>
              <div className="article-card__media">
                <img src={article.images[0] || newsImages[index % newsImages.length] || "/stuff/block-1.jpg"} alt={article.title} />
              </div>
              <div className="article-card__body">
                <h3>{article.title}</h3>
                <p>{article.excerpt}</p>
                <Link href={article.path}>Читать далее...</Link>
              </div>
            </article>
          ))}
        </div>
        <div className="clone-cta-wrap">
          <Link className="clone-cta clone-cta--green" href="/articles">
            Загрузить ещё
          </Link>
        </div>
      </section>

      <section className="clone-section clone-section--narrow" id="media">
        <div className="clone-heading">
          <h2 className="clone-title">Видео и подкасты</h2>
          <p>Глубокие размышления и практические советы. С юмором о важном в нашей жизни.</p>
        </div>
        <div className="media-grid">
          {mediaCards.map((card) => (
            <article className={`media-card ${card.wide ? "media-card--wide" : ""}`} key={card.title}>
              <div className="media-card__preview">
                <img src={card.image} alt={card.title} />
                <button type="button" aria-label="Воспроизвести">
                  ▶
                </button>
              </div>
              <div className="media-card__copy">
                <h3>{card.title}</h3>
                <p>{card.text}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="clone-cta-wrap">
          <Link className="clone-cta clone-cta--green" href={videoPage?.path || "/media"}>
            Оставить заявку на лекцию в записи
          </Link>
        </div>
      </section>

      <section
        className="contact-hero"
        id="contacts"
        style={{
          backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.8), rgba(0, 0, 0, 0.3)), url(${aboutPage?.images[0] || "/stuff/black-16.jpg"})`,
        }}
      >
        <div className="contact-hero__inner">
          <div className="contact-hero__portrait">
            <img src="/old-site/contact-portrait.webp" alt="Людмила Ладыженко" />
          </div>
          <div className="contact-hero__divider" />
          <p className="contact-hero__lead">{home.tagline}</p>
          <div className="contact-hero__buttons">
            {footerContacts.map((contact) => (
              <a
                key={contact.label}
                className={`contact-hero__button contact-hero__button--${contact.kind}`}
                href={contact.href}
                target="_blank"
                rel="noreferrer"
              >
                {contact.label}
              </a>
            ))}
          </div>
        </div>
      </section>

      <footer className="clone-footer">
        <div className="clone-footer__grid">
          <div>
            <p>
              <strong>© 2025 Людмила Ладыженко</strong>
            </p>
            <p>Ladyzenko@mail.ru</p>
            <p>+79177542323</p>
          </div>
          <div>
            <a href="#about">Обо мне</a>
            <a href="#lectures">Записи лекций</a>
            <a href="#services">Услуги</a>
            <a href="#articles">Статьи</a>
          </div>
          <div>
            <a href="#news">Фото</a>
            <a href="#certificates">Дипломы и сертификаты</a>
          </div>
          <div>
            <p className="clone-footer__title">Не пропустить полезное</p>
            <div className="clone-footer__subscribe">
              <input type="email" placeholder="Ваш Email" aria-label="Ваш Email" />
              <button type="button">➤</button>
            </div>
          </div>
        </div>
        <div className="clone-footer__bottom">
          <span>Пользовательское соглашение</span>
          <span>Политика конфиденциальности</span>
        </div>
      </footer>
    </div>
  );
}
