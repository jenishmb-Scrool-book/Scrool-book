// Текст первого запуска. Показывает саму механику приложения на себе же:
// человек читает инструкцию ровно тем способом, который она описывает.
//
// Это первое, что видят все — в том числе двенадцать тестировщиков закрытого
// теста. Поэтому текст обязан описывать приложение, которое есть сейчас, а не
// то, каким оно было раньше: устаревшая инструкция читается как заброшенная
// программа. Добавили движок или формат — правится и здесь.
//
// Абзацы короткие намеренно: каждый становится отдельным сообщением в
// переписке и отдельной карточкой в клипах.
//
// Языков два, и второй — не роскошь: язык человек выбирает во вступлении, на
// первом же экране, и подкладывать после этого русскую книгу тому, кто выбрал
// английский, значит спросить и не услышать.
export const SEED_TITLE = 'Как это работает';

export const SEED = `Как это работает

Ты вставляешь свою книгу или любой текст. Приложение режет его на короткие куски и показывает не как книгу, а как экран телефона.

Дальше выбирай, чем листать.

Переписка — тут два способа сразу. В списке чатов каждая строка это кусок книги от очередного человека: можно просто идти по контактам сверху вниз и читать. А зайдёшь в чат — там разговор: одну реплику говорит собеседник, следующую ты, между ними смайлики. Обёрток тут три, они переключаются в настройках.

Клипы — на весь экран, свайпом вверх.

Истории — по касанию: правая половина вперёд, левая назад.

Видео — тоже два способа. Текст лежит прямо в названиях роликов: можно читать по списку, ничего не открывая. А откроешь ролик — книга продолжается в описании под плеером и дальше в комментариях.

Лента — постами. Короткие посты — самыми мелкими кусками, по паре предложений.

Разница между ними не в раскраске, а в размере куска: от двух предложений до целой страницы. В какой-то день читается только по три строки — это тоже чтение.

Главное: позиция общая. Прочитал десять кусков в клипах, зашёл в переписку — продолжаешь с той же строки, хотя куски там короче.

Свои книги добавляй в «Библиотеке»: вставь текст в поле или открой файл — .txt, .fb2 или .epub.

Если в книге есть картинки, они показываются там же, где её текст: в ленте — кадром поста, в переписке — присланным фото, в роликах — превью.

Оглавление открывается кнопкой в шапке: «⋮» в переписке, «☰» на остальных экранах. Главы берутся из файла, а в обычном тексте распознаются заголовки вроде «Глава 5».

Внизу видно, сколько осталось: не проценты, а время. Вопрос обычно не «далеко ли я», а «успею ли сейчас».

В настройках есть тема, размер шрифта, свои обои и напоминание раз в сутки — если сам включишь.

Приложение работает без интернета: разрешения выходить в сеть у него просто нет. Книги остаются на твоём телефоне, отправить их некуда.

Этот текст — тоже книга. Удали его, когда добавишь свою.`;

const TITLE_EN = 'How it works';

const SEED_EN = `How it works

You paste in your own book, or any text at all. The app cuts it into short pieces and shows them not as a book, but as a phone screen.

Then pick what you flip through.

Chat — two ways at once here. In the chat list every row is a piece of the book from another person: you can simply go down the contacts and read. Open a chat and it turns into a conversation: one line is theirs, the next one yours, with emoji in between. There are three wrappers, switched in settings.

Clips — full screen, swipe up.

Stories — by tapping: the right half goes forward, the left one back.

Video — two ways as well. The text sits right in the titles of the clips, so you can read down the list without opening anything. Open one and the book carries on in the description under the player and then in the comments.

Feed — as posts. Short posts — in the smallest pieces, a couple of sentences each.

What differs between them is not the paint, it is the size of the piece: from two sentences to a whole page. Some days only three lines at a time will do — that is reading too.

The main thing: the position is shared. Read ten pieces in clips, open the chat — you carry on from the same line, even though the pieces there are shorter.

Add your own books in the Library: paste the text into the field or open a file — .txt, .fb2 or .epub.

If the book has pictures in it, they show up where its text does: in the feed as the body of a post, in chat as a sent photo, in video as the thumbnail.

The contents open with the button in the header: “⋮” in chat, “☰” on every other screen. Chapters come from the file, and in plain text the app recognises headings like “Chapter 5”.

At the bottom you can see what is left: not per cent, but time. The question is usually not “how far along am I”, it is “can I finish this now”.

Settings hold the theme, the text size, your own wallpaper and one reminder a day — if you switch it on yourself.

The app works without the internet: it simply has no permission to go online. Your books stay on your phone, there is nowhere to send them.

This text is a book too. Delete it once you have added your own.`;

/**
 * Первая книга на выбранном языке.
 *
 * Заводится не при первом запуске, а ПОСЛЕ вступления: до него язык ещё не
 * выбран, а переписать уже лежащую книгу нельзя — вместе с ней переписалось бы
 * и место чтения в ней.
 */
export const seedOf = lang =>
  (lang === 'en' ? {title: TITLE_EN, text: SEED_EN} : {title: SEED_TITLE, text: SEED});
