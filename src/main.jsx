import {createRoot} from 'react-dom/client';
import {StoreProvider} from './store.jsx';
import App from './App.jsx';
import Crash from './ui/Crash.jsx';
import './styles.css';

// Без StrictMode намеренно: он вызывает эффекты дважды, а initNative() вешает
// слушателя аппаратной «назад» — две подписки дают двойное срабатывание на Android.
createRoot(document.getElementById('root')).render(
  <StoreProvider>
    {/* Последний рубеж: экраны прикрыты своим предохранителем в App, а этот
        ловит то, что упало в самом App. Отсюда уйти можно только заново. */}
    <Crash onHome={() => window.location.reload()} homeLabel="crash.restart">
      <App />
    </Crash>
  </StoreProvider>
);
