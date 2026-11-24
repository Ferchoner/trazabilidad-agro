// Tema claro u oscuro de la interfaz (public/tema.js, T-015).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Tema = require('../public/tema.js') as {
  resolverTema(guardado: string | null, prefiereOscuro: boolean | undefined): 'light' | 'dark';
};

describe('resolverTema', () => {
  it('respeta lo que eligió el usuario aunque el sistema diga otra cosa', () => {
    expect(Tema.resolverTema('dark', false)).toBe('dark');
    expect(Tema.resolverTema('light', true)).toBe('light');
  });

  it('sin elección guardada sigue al sistema operativo', () => {
    expect(Tema.resolverTema(null, true)).toBe('dark');
    expect(Tema.resolverTema(null, false)).toBe('light');
    expect(Tema.resolverTema(null, undefined)).toBe('light');
  });

  it('ignora un valor guardado que no es un tema', () => {
    expect(Tema.resolverTema('morado', true)).toBe('dark');
    expect(Tema.resolverTema('', false)).toBe('light');
  });
});
