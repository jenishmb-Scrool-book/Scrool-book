import {createRoot} from 'react-dom/client';
import {StoreProvider} from './store.jsx';
import App from './App.jsx';
import './styles.css';

// Без StrictMode намеренно: он вызывает эффекты дважды, а initNative() вешает
// слушателя аппаратной «назад» — две подписки дают двойное срабатывание на Android.
createRoot(document.getElementById('root')).render(
  <StoreProvider>
    <App />
  </StoreProvider>
);
