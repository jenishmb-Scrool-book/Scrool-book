import {useT} from '../i18n.js';
import Glyph from './Glyph.jsx';

// Шапка экрана: «назад», заголовок и произвольные вставки слева/справа.
export default function Header({onBack, title, left, right}) {
  const t = useT();
  return (
    <div className="hdr">
      <span className="back" onClick={onBack} role="button" aria-label={t('back')}><Glyph name="back" /></span>
      {left}
      <h2>{title}</h2>
      {right}
    </div>
  );
}
