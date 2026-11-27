const articlePlural = new Intl.PluralRules('ru-RU');

export function articleCountLabel(count: number) {
  const forms: Record<string, string> = { one: 'статья', few: 'статьи', many: 'статей', other: 'статьи' };
  return `${count.toLocaleString('ru-RU')} ${forms[articlePlural.select(count)]}`;
}
