import {readFileSync} from 'node:fs';
import {describe, it, expect} from 'vitest';
import {APP_NAME} from './name.js';

// Имя приложения и id пакета лежат в файлах, которые читают разные вещи:
// лаунчер Android, Capacitor, браузер, Gradle. Совпадать они обязаны, а
// проверить это глазами нельзя — файлы в четырёх папках и правятся по одному.
// Разъедутся они молча: приложение соберётся и запустится, просто подписано
// будет по-разному в разных местах, а id, уехавший от namespace, роняет сборку
// только на релизе.
//
// Источник правды здесь — capacitor.config.json: это единственный из файлов,
// который читает сам Capacitor, и из него имя с id расходятся при `cap sync`.
// Поэтому ожидаемого значения в тесте нет: всё сверяется с ним.

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const cfg = JSON.parse(read('capacitor.config.json'));
const strings = read('android/app/src/main/res/values/strings.xml');
const gradle = read('android/app/build.gradle');

/** Значение <string name="..."> из strings.xml. */
const str = name =>
  (strings.match(new RegExp('<string name="' + name + '">([^<]*)</string>')) || [])[1];

describe('название приложения', () => {
  it('в capacitor.config.json и в JS — одно и то же', () => {
    expect(cfg.appName).toBe(APP_NAME);
  });

  it('совпадает с тем, что показывает лаунчер Android', () => {
    expect(str('app_name')).toBe(APP_NAME);
    expect(str('title_activity_main')).toBe(APP_NAME);
  });

  it('совпадает с заголовком страницы', () => {
    expect(read('index.html')).toContain('<title>' + APP_NAME + '</title>');
  });
});

// id пакета в Play не меняется никогда — он выбирается один раз и навсегда.
// Пока приложения в магазине нет, расхождение стоит правки в одну строку;
// после первой заливки — нового приложения.
describe('id пакета', () => {
  it('в Gradle namespace и applicationId совпадают с конфигом', () => {
    expect(gradle).toContain('namespace "' + cfg.appId + '"');
    expect(gradle).toContain('applicationId "' + cfg.appId + '"');
  });

  it('совпадает с тем, что записано в strings.xml', () => {
    expect(str('package_name')).toBe(cfg.appId);
    expect(str('custom_url_scheme')).toBe(cfg.appId);
  });

  // Путь к MainActivity.java обязан повторять пакет: Gradle ищет класс
  // по имени пакета, а не по содержимому файла.
  it('совпадает с пакетом и путём MainActivity', () => {
    const path = 'android/app/src/main/java/' + cfg.appId.replace(/\./g, '/') + '/MainActivity.java';
    expect(read(path)).toContain('package ' + cfg.appId + ';');
  });
});
