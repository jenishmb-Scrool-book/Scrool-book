import {useStore} from '../store.jsx';
import {useT} from '../i18n.js';
import {APPS} from './Home.jsx';
import {APP_NAME} from '../name.js';
import AppIcon from '../ui/AppIcon.jsx';
import StatusBar from '../ui/StatusBar.jsx';

// Первый запуск: сперва язык, потом короткое объяснение.
//
// Порядок именно такой, и другим он быть не может: объяснение написано словами,
// а на каком языке их читать, приложение ещё не знает. Поэтому шаг выбора —
// единственный экран, где строки не берутся из словаря: он написан на обоих
// языках сразу.
//
// Зачем вообще этот экран, если инструкция и так лежит первой книгой. Затем,
// что прочитать её можно, только уже понимая, куда попал: домашний экран с
// чужими на вид значками объясняет ровно ничего, а «Продолжить» на нём ведёт
// в ленту, которая выглядит как чужое приложение. Здесь три карточки на
// полминуты, а подробности — в той самой книге, и на последней карточке об
// этом сказано прямо.

// Мини-домашний экран: те же значки, тем же порядком, что и на настоящем.
// Показать их раньше слов — самый короткий способ сказать, чем это притворяется.
const Apps = () => (
  <div className="iart iapps">
    {APPS.map(([glyph, , , background, , round], k) => (
      <span key={k} className={round ? 'rnd' : undefined} style={{'--i': k}}>
        <AppIcon name={glyph} background={background} />
      </span>
    ))}
  </div>
);

// Куски книги, идущие лентой. Карточки едут вверх сами — это и есть ответ на
// вопрос «а что мне делать»: ничего, кроме привычного движения пальцем.
//
// Карточек шесть, и все одинаковые: лента едет ровно на три штуки и тут же
// начинается заново, а при одинаковых карточках этот возврат не виден вовсе.
const Cards = () => (
  <div className="iart icards">
    <div className="in">
      {[0, 1, 2, 3, 4, 5].map(k => (
        <div className="ic" key={k}><i /><i /><i /></div>
      ))}
    </div>
  </div>
);

// Два разных «приложения» и одна полоса под ними. Это и есть весь продукт,
// поэтому картинка здесь буквальная: слева клип, справа переписка, место одно.
const Shared = () => (
  <div className="iart ishare">
    <div className="isc dark"><i /><i /><i /></div>
    <div className="isc chat"><b /><b className="me" /><b /></div>
    <div className="ibar"><i /><em /></div>
  </div>
);

const PAGES = [
  {t: 'intro.t1', b: 'intro.b1', art: <Apps />},
  {t: 'intro.t2', b: 'intro.b2', art: <Cards />},
  {t: 'intro.t3', b: 'intro.b3', art: <Shared />, note: 'intro.note'}
];

export const STEPS = PAGES.length + 1;      // плюс шаг выбора языка

/**
 * @param {number} step 0 — язык, дальше карточки
 * @param {(n: number) => void} onStep перейти на шаг
 * @param {() => void} onDone вступление пройдено
 */
export default function Intro({step, onStep, onDone}) {
  const {ui, setUi} = useStore();
  const t = useT();

  // Язык записывается сразу же: следующий шаг уже показывается на нём.
  // Дописывать мету немедленно тут незачем — приложение, умершее посреди
  // вступления, покажет его заново, и выбор будет спрошен ещё раз.
  const choose = lang => {
    if (lang !== ui.lang) setUi({lang});
    onStep(1);
  };

  if (step === 0) {
    return (
      <div className="screen on intro" id="intro">
        <StatusBar />
        <div className="ibody ilang">
          {/* Название одинаково в обоих языках: это имя продукта, оно же
              в <title> и в strings.xml. А вот подпись — на обоих сразу:
              человек ещё не сказал, на каком с ним говорить. */}
          <div className="iname">{APP_NAME}</div>
          <div className="itag">
            <span>Книга, которая листается как лента</span>
            <span>A book you scroll like a feed</span>
          </div>
          <div className="ipick">Язык · Language</div>
          <button onClick={() => choose('ru')}>Русский</button>
          <button onClick={() => choose('en')}>English</button>
        </div>
      </div>
    );
  }

  const k = Math.min(Math.max(step, 1), PAGES.length) - 1;
  const page = PAGES[k];
  const last = k === PAGES.length - 1;

  return (
    <div className="screen on intro" id="intro">
      <StatusBar />
      {/* Строка сверху есть всегда, даже когда кнопки в ней нет: иначе
          на последней карточке весь экран подпрыгивал бы на её высоту. */}
      <div className="ihead">
        {last ? null : <button className="iskip" onClick={onDone}>{t('intro.skip')}</button>}
      </div>
      <div className="ibody">
        {page.art}
        <h1>{t(page.t)}</h1>
        <p>{t(page.b)}</p>
        {page.note ? <p className="inote">{t(page.note)}</p> : null}
      </div>
      <div className="ifoot">
        <div className="idots">
          {PAGES.map((_, i) => <i key={i} className={i === k ? 'on' : undefined} />)}
        </div>
        <button className="igo" onClick={() => (last ? onDone() : onStep(step + 1))}>
          {last ? t('intro.start') : t('intro.next')}
        </button>
      </div>
    </div>
  );
}
