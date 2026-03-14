import Link from "next/link";

export default function NotFound() {
  return (
    <div className="page-stack">
      <section className="page-intro">
        <p className="kicker">404</p>
        <h1>Страница не найдена</h1>
        <p className="lead">
          Возможно, этот адрес был на старой Tilda-версии. Навигация ниже поможет вернуться.
        </p>
        <Link className="button primary" href="/">
          На главную
        </Link>
      </section>
    </div>
  );
}
