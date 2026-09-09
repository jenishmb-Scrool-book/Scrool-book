import {useCallback, useMemo} from 'react';
import {chunk, indexAt} from '../lib/chunk.js';
import {useStore} from '../store.jsx';

// Нарезка под конкретный экран. Стор хранит сырой текст и смещение в символах,
// а размер фрагмента у каждого экрана свой: в «коротком» — 140 знаков, в «видео» — 600.
// Именно разный темп, а не разная палитра, создаёт ощущение разных приложений.
//
// Позиция при этом остаётся общей: смещение переводится в номер фрагмента ТЕКУЩЕЙ
// нарезки на лету, а обратно записывается смещением. Поэтому переход между
// экранами с разной длиной фрагмента не сдвигает место в книге.
export default function useChunks(size = 280) {
  const {text, offset, setOffset, place, setSeen, flush} = useStore();

  // Нарезка дорогая и синхронная — держим её на (text, size), а не на смещении:
  // иначе книга резалась бы заново на каждом кадре скролла.
  const chunks = useMemo(() => chunk(text, size), [text, size]);
  const pos = useMemo(() => indexAt(chunks, offset), [chunks, offset]);

  const setPos = useCallback(i => {
    if (!chunks.length) return;
    const k = Math.min(Math.max(Math.trunc(Number(i)) || 0, 0), chunks.length - 1);
    setOffset(chunks[k].at);
  }, [chunks, setOffset]);

  // Место взгляда — то же смещение в символах, что и курсор, но ответ на
  // другой вопрос: не «докуда прочитано», а «что было на экране». Расходятся
  // они, когда листают назад. Наружу отдаём номером ЭТОЙ нарезки: окну рендера
  // нужна карточка, хранилищу — символы, и перевод между ними — работа этого
  // хука, ровно как с курсором.
  const eye = useMemo(() => ({
    i: chunks.length && place && place.at != null ? indexAt(chunks, place.at) : null,
    y: (place && place.y) || 0,
    // `now` — записать не откладывая: приложение сворачивают, дебаунса нет.
    keep: (i, y, now) => {
      const c = chunks[i];
      if (c) setSeen(c.at, y);
      if (now) flush();
    }
  }), [chunks, place, setSeen, flush]);

  return {chunks, pos, setPos, eye};
}
