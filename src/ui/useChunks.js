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
  const {text, offset, setOffset} = useStore();

  // Нарезка дорогая и синхронная — держим её на (text, size), а не на смещении:
  // иначе книга резалась бы заново на каждом кадре скролла.
  const chunks = useMemo(() => chunk(text, size), [text, size]);
  const pos = useMemo(() => indexAt(chunks, offset), [chunks, offset]);

  const setPos = useCallback(i => {
    if (!chunks.length) return;
    const k = Math.min(Math.max(Math.trunc(Number(i)) || 0, 0), chunks.length - 1);
    setOffset(chunks[k].at);
  }, [chunks, setOffset]);

  return {chunks, pos, setPos};
}
