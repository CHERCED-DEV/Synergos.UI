import { profesionalesDelListado } from './directorio-api.client';

/**
 * La forma es la que emite el servidor (`LecturaDeProfesionalesContractTests`, CMS): un listado del catálogo genérico
 * con un profesional de la muestra, uno que no dice si admite pacientes y uno sin agenda entera.
 */
const listadoDelServidor = {
  elementos: [
    {
      id: 'doc-ana-rios',
      titulo: 'Dra. Ana Ríos',
      imagen: '/media/ehr/doctors/ana-rios.webp',
      precio: null,
      precioAntes: null,
      calificacion: null,
      disponibles: null,
      atributos: {
        especialidad: 'Medicina Interna',
        dias: '1,2,3,4,5',
        desde: '8',
        hasta: '16',
        minutos: '30',
        registro: 'RM-48213',
        experiencia: '14',
        aceptaPacientes: 'si',
      },
    },
    {
      id: 'doc-no-consta',
      titulo: 'Dr. No Consta',
      imagen: null,
      precio: null,
      precioAntes: null,
      calificacion: null,
      disponibles: null,
      atributos: { especialidad: 'Pediatría', dias: '2', desde: '9', hasta: '12', minutos: '20' },
    },
    {
      id: 'doc-sin-agenda',
      titulo: 'Dra. Sin Agenda',
      imagen: null,
      precio: null,
      precioAntes: null,
      calificacion: null,
      disponibles: null,
      atributos: { especialidad: 'Dermatología', dias: '', desde: '9', hasta: '12', minutos: '20', aceptaPacientes: 'no' },
    },
  ],
  facetas: [],
  total: 3,
  pagina: 1,
  porPagina: 100,
};

describe('el directorio de Salud desde la lectura genérica', () => {
  it('lee cada profesional con su especialidad, su registro, su foto y su agenda declarada', () => {
    const [ana] = profesionalesDelListado(listadoDelServidor) ?? [];

    expect(ana).toEqual({
      id: 'doc-ana-rios',
      nombre: 'Dra. Ana Ríos',
      especialidad: 'Medicina Interna',
      registro: 'RM-48213',
      telefono: '',
      correo: '',
      aceptaPacientes: true,
      foto: '/media/ehr/doctors/ana-rios.webp',
      agenda: { dias: [1, 2, 3, 4, 5], desde: 8, hasta: 16, minutos: 30 },
    });
  });

  it('lo que no consta queda en null, y no en un «sí» ni en un «no»', () => {
    const porId = new Map((profesionalesDelListado(listadoDelServidor) ?? []).map((p) => [p.id, p]));

    expect(porId.get('doc-no-consta')?.aceptaPacientes).toBeNull();
    expect(porId.get('doc-sin-agenda')?.aceptaPacientes).toBe(false);
    expect(porId.get('doc-no-consta')?.foto).toBeNull();
  });

  it('una agenda incompleta no se inventa: queda en null', () => {
    const porId = new Map((profesionalesDelListado(listadoDelServidor) ?? []).map((p) => [p.id, p]));

    expect(porId.get('doc-sin-agenda')?.agenda).toBeNull();
    expect(porId.get('doc-no-consta')?.agenda).toEqual({ dias: [2], desde: 9, hasta: 12, minutos: 20 });
  });

  it('otra forma no es un directorio vacío: es null, y quien lee lanza', () => {
    expect(profesionalesDelListado({ doctors: [] })).toBeNull();
    expect(profesionalesDelListado(null)).toBeNull();
    expect(profesionalesDelListado({ elementos: [] })).toEqual([]);
  });
});
