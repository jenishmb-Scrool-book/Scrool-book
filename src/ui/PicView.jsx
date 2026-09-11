import {createContext, useContext, useEffect, useLayoutEffect, useRef, useState} from 'react';
import {useT} from '../i18n.js';

// Картинка из книги во весь экран.
//
// В ленте иллюстрация стоит в ряду с текстом и занимает ширину карточки: этого
// хватает, чтобы понять, что на ней, и не хватает, чтобы разглядеть карту,
// схему или подпись мелким шрифтом под рисунком. В любом настоящем приложении
// такая картинка открывается по нажатию — здесь теперь тоже.
//
// Живёт просмотр не внутри карточки, а поверх всего «телефона», и это не
// придирка: карточка прокручивается, а открытая картинка не должна уезжать
// вместе с ней. Отсюда и провайдер — открывает картинку карточка, а показывает
// её App.

const noop = () => {};
const Ctx = createContext(noop);

/** App кладёт сюда «показать картинку». */
export const PicProvider = Ctx.Provider;

/**
 * `openPic(src)` — показать картинку во весь экран. Вне провайдера это
 * пустышка, поэтому звать можно откуда угодно и проверять ничего не нужно.
 */
export const useOpenPic = () => useContext(Ctx);

/** На сколько увеличивает нажатие по картинке. */
const ZOOM = 2.5;

export default function PicView({src, onClose}) {
  const t = useT();
  const box = useRef(null);
  const [zoom, setZoom] = useState(false);
  // Точка, по которой нажали, долями ширины и высоты рамки. Нужна увеличению:
  // показываем то место картинки, куда человек ткнул.
  const focus = useRef({x: .5, y: .5});

  // Закрыли и открыли другую — снова целиком. Иначе вторая открывалась бы
  // увеличенной, да ещё и в том месте, где увеличили первую.
  useEffect(() => setZoom(false), [src]);

  // Escape — для разработки в браузере: на телефоне то же делает аппаратная
  // «назад», её перехватывает App.
  useEffect(() => {
    const onKey = e => {if (e.key === 'Escape') onClose();};
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Прокрутка к тому месту, по которому нажали. Без неё увеличенная картинка
  // показывала бы свой левый верхний угол, и до подписи под рисунком пришлось
  // бы доезжать через весь лист.
  //
  // Именно эффектом, а не сразу в обработчике: в момент нажатия картинка ещё
  // прежнего размера, прокручивать в ней нечего. И именно layout-эффектом —
  // обычный сработал бы после кадра, то есть увеличение успело бы мелькнуть
  // левым верхним углом.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || !zoom) return;
    el.scrollLeft = focus.current.x * (el.scrollWidth - el.clientWidth);
    el.scrollTop = focus.current.y * (el.scrollHeight - el.clientHeight);
  }, [zoom]);

  if (!src) return null;

  /** Нажатие по самой картинке увеличивает её, а не закрывает. */
  const toggle = e => {
    e.stopPropagation();
    const el = box.current;
    if (el) {
      const r = el.getBoundingClientRect();
      focus.current = {x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height};
    }
    setZoom(!zoom);
  };

  return (
    <div className="shot" role="dialog" aria-modal="true" aria-label={t('pic.alt')} onClick={onClose}>
      <div className={'sbox' + (zoom ? ' zoom' : '')} ref={box} style={{'--zoom': ZOOM}}>
        <img src={src} alt={t('pic.alt')} onClick={toggle}
             role="button" aria-label={t(zoom ? 'pic.zoom_out' : 'pic.zoom_in')} />
      </div>
      <button type="button" className="sx" onClick={onClose} aria-label={t('pic.close')}>✕</button>
    </div>
  );
}
