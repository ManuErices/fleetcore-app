import { collection, getDocs, writeBatch, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebase';

const MACHINES_DATA = [
  {
    codigo: 'PRXS22', patente: 'PRXS22', digitoVerificador: '8',
    tipo: 'CAMION COMBUSTIBLE', marca: 'MERCEDES BENZ', modelo: 'ATEGO 2730',
    año: 2000, kmsHrs: 72859, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'GODIESEL SPA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'RFJB46', patente: 'RFJB46', digitoVerificador: '',
    tipo: 'CAMION COMBUSTIBLE', marca: 'MERCEDES BENZ', modelo: 'AXOR 3131',
    año: 2021, kmsHrs: 713317, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'GODIESEL SPA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'SVDX45', patente: 'SVDX45', digitoVerificador: '',
    tipo: 'BULLDOZER', marca: 'CATERPILLAR', modelo: 'D8 19B',
    año: 2023, kmsHrs: 4927, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: '', patente: '', digitoVerificador: '',
    tipo: 'MARTILLO HIDRAULICO', marca: 'CATERPILLAR', modelo: 'MARTILLO HIDRAULICO CATERPILLAR',
    año: 2000, kmsHrs: 6729, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'RE-01', patente: 'SWKB41', digitoVerificador: '',
    tipo: 'RETROEXCAVADORA', marca: 'SANY', modelo: 'BHL75A',
    año: 2024, kmsHrs: 2761, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'RSBB65', patente: 'RSBB65', digitoVerificador: '8',
    tipo: 'EXCAVADORA', marca: 'CATERPILLAR', modelo: '330 07',
    año: 2025, kmsHrs: 5148, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'SOCIEDAD CONSTRUCTORA E INVERSIONES EL TORO NEGRO LIMITADA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: '110074', patente: '110074', digitoVerificador: '',
    tipo: 'BULLDOZER', marca: 'KOMATSU', modelo: 'D155AX-8E0',
    año: 2026, kmsHrs: 74, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'SOCIEDAD CONSTRUCTORA E INVERSIONES EL TORO NEGRO LIMITADA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'CF-01', patente: 'TGPD85', digitoVerificador: '',
    tipo: 'CARGADOR FRONTAL', marca: 'XCMG', modelo: 'XCMG',
    año: 2024, kmsHrs: 1927, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'TTJY25', patente: 'TTJY25', digitoVerificador: '8',
    tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX DCAB MT 4X4 2.4',
    año: 2025, kmsHrs: 66512, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'ARRIENDOS Y TRANSPORTES SEHA SPA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'EX-02', patente: 'TLPJ56', digitoVerificador: '',
    tipo: 'EXCAVADORA', marca: 'SANY', modelo: 'SY305H',
    año: 2022, kmsHrs: 2018, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'TWJY80', patente: 'TWJY80', digitoVerificador: '',
    tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX',
    año: 2025, kmsHrs: 46616, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'ARRIENDOS Y TRANSPORTES SEHA SPA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'TYRH70', patente: 'TYRH70', digitoVerificador: '',
    tipo: 'CAMION COMBUSTIBLE', marca: 'VOLVO', modelo: 'FM X',
    año: 2000, kmsHrs: 18475, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'SPCV53', patente: 'SPCV53', digitoVerificador: '',
    tipo: 'CAMION ALJIBE', marca: 'MERCEDES BENZ', modelo: 'AROCS 3342K/36 RET',
    año: 2023, kmsHrs: 92389, proyecto: 'NUEVO COBRE',
    propiedad: 'SUBCONTRATO', proveedor: 'INVERSIONES TREKTRADING SPA', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'TBSB36', patente: 'TBSB36', digitoVerificador: '',
    tipo: 'EXCAVADORA', marca: 'CATERPILLAR', modelo: 'CATERPILLAR 333',
    año: 2025, kmsHrs: 4618, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'TRST29', patente: 'TRST29', digitoVerificador: '',
    tipo: 'EXCAVADORA', marca: 'KOMATSU', modelo: 'PC 300',
    año: 2025, kmsHrs: 1941, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: '', patente: '', digitoVerificador: '',
    tipo: 'MARTILLO HIDRAULICO', marca: 'KOMATSU', modelo: 'EC140T',
    año: 2000, kmsHrs: 5024, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'THYG91', patente: 'THYG91', digitoVerificador: '',
    tipo: 'EXCAVADORA', marca: 'KOMATSU', modelo: 'PC 300',
    año: 2025, kmsHrs: 3456, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'VM-09', patente: 'SZHY22', digitoVerificador: '',
    tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX 2.4 TM 4X4 - DX44MT24 R-3',
    año: 2024, kmsHrs: 32916, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'VM-08', patente: 'SZHY21', digitoVerificador: '',
    tipo: 'CAMIONETA', marca: 'TOYOTA', modelo: 'HILUX 2.4 TM 4X4 - DX44MT24 R-3',
    año: 2024, kmsHrs: 48499, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'VM-01', patente: 'RPVC76', digitoVerificador: '',
    tipo: 'CAMIONETA', marca: 'MITSUBISHI', modelo: 'L200 KATANA CRT 4X4 2.4',
    año: 2022, kmsHrs: 71005, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
  {
    codigo: 'MN-02', patente: 'PPFG89', digitoVerificador: '',
    tipo: 'MOTONIVELADORA', marca: 'JOHN DEERE', modelo: '672G',
    año: 2021, kmsHrs: 7676, proyecto: 'NUEVO COBRE',
    propiedad: 'PROPIA', proveedor: '', empresa: 'MPF Ingeniería Civil',
  },
];

export async function runSeedMachines(empresaId) {
  if (!empresaId) throw new Error('empresaId requerido');

  const machinesRef = collection(db, 'empresas', empresaId, 'machines');

  const snapshot = await getDocs(machinesRef);
  console.log(`[seedMachines] Eliminando ${snapshot.size} documentos existentes...`);

  const deleteBatch = writeBatch(db);
  snapshot.docs.forEach(d => deleteBatch.delete(d.ref));
  await deleteBatch.commit();
  console.log('[seedMachines] Documentos eliminados.');

  const createBatch = writeBatch(db);
  MACHINES_DATA.forEach(machine => {
    const newRef = doc(machinesRef);
    createBatch.set(newRef, {
      ...machine,
      name: machine.tipo,
      code: machine.codigo,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  await createBatch.commit();
  console.log(`[seedMachines] ${MACHINES_DATA.length} máquinas creadas.`);

  return MACHINES_DATA.length;
}
