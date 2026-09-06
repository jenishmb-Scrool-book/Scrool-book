import {useEffect, useState} from 'react';

const now = () => {
  const d = new Date();
  return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
};

// Бутафорский статус-бар «как в телефоне». Часы тикают раз в 30 секунд, как в прототипе.
export default function StatusBar() {
  const [t, setT] = useState(now);
  useEffect(() => {
    const id = setInterval(() => setT(now()), 30000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="status">
      <span className="ct">{t}</span>
      <span>▮▮▮ ⌁ 87%</span>
    </div>
  );
}
