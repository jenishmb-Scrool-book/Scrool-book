import {createContext, useContext} from 'react';
import {pattern} from '../lib/find.js';

// Подсветка найденного: после перехода из поиска слово на экране чтения
// выделено маркером и через несколько секунд гаснет.
//
// Без неё переход приводил к карточке, где слово есть, — и дальше его надо
// было искать глазами. В клипах это абзац, в «видео» — описание на 600 знаков:
// то самое чтение по диагонали, от которого поиск и должен был избавить.
//
// Что подсвечивать, решает App: он кладёт сюда `{q, at}` — запрос и смещение
// находки — при переходе из поиска и снимает через десять секунд или на
// первом же другом переходе. Экраны ничего не знают: они оборачивают кусок
// книги в `<Hit>`, и тот сам решает, его ли это находка.

const Ctx = createContext(null);
export const HitProvider = Ctx.Provider;

/**
 * Текст куска с найденным словом под маркером — если находка лежит в нём.
 *
 * @param {string} text  текст куска, как его показывает экран (пробелы схлопнуты)
 * @param {number} at    смещение начала куска в книге
 * @param {number} end   смещение конца куска (не включая)
 *
 * Ищем по тексту куска тем же шаблоном, а не переводим смещение: текст куска
 * нормализован (пробелы схлопнуты, см. `lib/chunk.js`), и смещение из книги в
 * нём указывает не туда. Шаблон поиска устроен так, что находит то же самое и
 * в нормализованном тексте: пробел в нём и так совпадает с любым промежутком.
 */
export default function Hit({text, at, end}) {
  const hit = useContext(Ctx);
  if (!hit || typeof text !== 'string' || !(hit.at >= at && hit.at < end)) return text;
  const re = pattern(hit.q);
  if (!re) return text;
  const out = [];
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(text.slice(last, m.index));
    out.push(<mark className="hit" key={m.index}>{m[0]}</mark>);
    last = m.index + m[0].length;
  }
  if (!out.length) return text;
  out.push(text.slice(last));
  return out;
}
