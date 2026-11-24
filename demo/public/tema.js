// Tema claro u oscuro de la interfaz (T-015). Es una preferencia de vista de este navegador,
// no un evento de negocio. Se carga en <head> para pintar con el tema correcto desde el inicio.
// Lo usan la interfaz (window.Tema) y las pruebas (module.exports).
'use strict';

(function (root) {
  const CLAVE = 'tema';
  const TEMAS = ['light', 'dark'];

  /** Gana lo que eligió el usuario; si no eligió (o el valor no es válido), sigue al sistema. */
  function resolverTema(guardado, prefiereOscuro) {
    if (TEMAS.includes(guardado)) return guardado;
    return prefiereOscuro ? 'dark' : 'light';
  }

  const api = { resolverTema };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }

  const doc = root.document;
  const sistema = root.matchMedia ? root.matchMedia('(prefers-color-scheme: dark)') : null;

  function leer() {
    try {
      return root.localStorage.getItem(CLAVE);
    } catch {
      return null;
    }
  }

  function guardar(tema) {
    try {
      root.localStorage.setItem(CLAVE, tema);
    } catch {
      /* sin almacenamiento del navegador: el cambio dura hasta recargar */
    }
  }

  function actual() {
    return doc.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  }

  function aplicar(tema) {
    doc.documentElement.dataset.theme = tema;
    doc.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('aria-checked', String(tema === 'dark'));
      btn.title = tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';
    });
  }

  function alternar() {
    const nuevo = actual() === 'dark' ? 'light' : 'dark';
    guardar(nuevo);
    aplicar(nuevo);
  }

  aplicar(resolverTema(leer(), sistema?.matches));
  // Mientras el usuario no elija, el tema sigue al sistema operativo.
  sistema?.addEventListener?.('change', (e) => {
    if (!TEMAS.includes(leer())) aplicar(e.matches ? 'dark' : 'light');
  });
  // Los interruptores existen hasta que se lee el <body>. Se enlazan aquí y no en app.js para
  // que funcionen aunque la aplicación no logre cargar sus datos.
  doc.addEventListener('DOMContentLoaded', () => {
    aplicar(actual());
    doc
      .querySelectorAll('[data-theme-toggle]')
      .forEach((btn) => btn.addEventListener('click', alternar));
  });

  root.Tema = { ...api, alternar, actual };
})(typeof window !== 'undefined' ? window : globalThis);
