// Pistola lectora en modo teclado (ADR-0014, ADR-0023): la pistola "teclea" el código muy rápido
// y termina con Enter. Se distingue de una persona por el ritmo, sin controladores.
'use strict';

(function (root) {
  /** Máximo entre teclas de una lectura, en milisegundos. Una persona tarda más. */
  const MAX_GAP_MS = 35;
  /** El Enter llega justo después del último carácter. */
  const MAX_ENTER_GAP_MS = 80;
  const MIN_LENGTH = 4;

  /** Llama a onScan(código) en cada lectura, en cualquier pantalla. */
  function attach(onScan) {
    let buffer = '';
    let last = 0;
    let target = null;
    let before = null;

    const clear = () => {
      buffer = '';
      target = null;
      before = null;
    };

    document.addEventListener(
      'keydown',
      (e) => {
        const now = e.timeStamp || performance.now();
        const gap = now - last;
        last = now;
        if (e.ctrlKey || e.altKey || e.metaKey) return clear();
        if (e.key === 'Enter') {
          const isScan = buffer.length >= MIN_LENGTH && gap <= MAX_ENTER_GAP_MS;
          if (isScan) {
            // La lectura no se queda escrita en el campo que tenía el foco ni envía su formulario.
            e.preventDefault();
            e.stopPropagation();
            if (target && before !== null && 'value' in target) target.value = before;
            const code = buffer;
            clear();
            onScan(code);
            return;
          }
          return clear();
        }
        if (e.key.length !== 1) return;
        if (buffer === '' || gap > MAX_GAP_MS) {
          buffer = e.key;
          target = e.target;
          before = target && 'value' in target ? target.value : null;
        } else {
          buffer += e.key;
        }
      },
      true,
    );
  }

  root.Escaner = { attach, MAX_GAP_MS };
})(window);
