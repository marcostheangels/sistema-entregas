// Geração de cobrança PIX (BR Code / copia e cola) — padrão Banco Central.
// Funciona 100% offline: só codifica chave + valor + recebedor.
// O pagamento em si é confirmado no app do banco de quem paga;
// o dinheiro cai na conta do DONO da chave.

const GUI_PIX = 'br.gov.bcb.pix';

const campo = (id, valor) => {
  const v = String(valor);
  return id + String(v.length).padStart(2, '0') + v;
};

// CRC16-CCITT-FALSE (poly 0x1021, init 0xFFFF) — exigido pelo BACEN
const crc16 = (str) => {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
};

// Nome/cidade: maiúsculas, sem acento, máx. permitido
const limparTexto = (texto, max) => String(texto || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 .\-/]/g, ' ')
  .replace(/\s+/g, ' ').trim().slice(0, max) || 'NAO INFORMADO';

// txid: só letras e números, 1–25 chars
const limparTxid = (id) => {
  const t = String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25);
  return t || '***';
};

export const gerarPixCopiaECola = ({ chave, nome, cidade, valor, txid }) => {
  const chaveLimpa = String(chave || '').trim();
  if (!chaveLimpa) throw new Error('Chave Pix vazia.');
  const v = Number(valor);
  if (!v || v <= 0) throw new Error('Valor inválido para cobrança.');

  const conta = campo('00', GUI_PIX) + campo('01', chaveLimpa);
  let payload =
    campo('00', '01') +
    campo('26', conta) +
    campo('52', '0000') +
    campo('53', '986') +
    campo('54', v.toFixed(2)) +
    campo('58', 'BR') +
    campo('59', limparTexto(nome, 25)) +
    campo('60', limparTexto(cidade, 15)) +
    campo('62', campo('05', limparTxid(txid))) +
    '6304';
  return payload + crc16(payload);
};
