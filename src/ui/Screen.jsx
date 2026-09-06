// Оболочка экрана: тот же `.screen.on`, что и в прототипе.
// В React в дереве живёт только активный экран, поэтому класс `on` стоит всегда,
// а `display:none` из CSS остаётся просто страховкой.
export default function Screen({id, children}) {
  return <div className="screen on" id={id}>{children}</div>;
}
