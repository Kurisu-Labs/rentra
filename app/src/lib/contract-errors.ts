import { decodeErrorResult, type Abi, type Hex } from "viem";

const ERROR_TEXT: Record<string, string> = {
  AlreadyResponded: "Tanggapan untuk klaim ini sudah dikirim.",
  BadAmount: "Jumlah yang dimasukkan tidak valid.",
  BadOutcome: "Hasil reputasi tidak valid.",
  BadSignature: "Tanda tangan tidak cocok. Minta tanda tangan baru.",
  BadStatus: "Status sewa ini tidak sesuai untuk tindakan tersebut.",
  CannotRentOwn: "Pemilik tidak bisa menyewa barangnya sendiri.",
  ECDSAInvalidSignature: "Tanda tangan tidak valid.",
  ECDSAInvalidSignatureLength: "Panjang tanda tangan tidak valid.",
  ECDSAInvalidSignatureS: "Tanda tangan tidak valid.",
  EmptyPhoto: "Foto kondisi belum direkam.",
  ERC20InsufficientAllowance: "Izin token tidak cukup untuk jumlah ini.",
  ERC20InsufficientBalance: "Saldo token tidak cukup.",
  ERC20InvalidApprover: "Akun yang memberi izin tidak valid.",
  ERC20InvalidReceiver: "Alamat penerima token tidak valid.",
  ERC20InvalidSender: "Alamat pengirim token tidak valid.",
  ERC20InvalidSpender: "Alamat yang diberi izin tidak valid.",
  ERC2612ExpiredSignature: "Izin tanda tangan token sudah kedaluwarsa.",
  ERC2612InvalidSigner: "Penandatangan izin token tidak cocok.",
  ERC721IncorrectOwner: "Pemilik NFT tidak sesuai.",
  ERC721InsufficientApproval: "Izin NFT tidak cukup.",
  ERC721InvalidApprover: "Pemberi izin NFT tidak valid.",
  ERC721InvalidOperator: "Operator NFT tidak valid.",
  ERC721InvalidOwner: "Pemilik NFT tidak valid.",
  ERC721InvalidReceiver: "Penerima NFT tidak valid.",
  ERC721InvalidSender: "Pengirim NFT tidak valid.",
  ERC721NonexistentToken: "Barang sewa tidak ditemukan.",
  EscrowAlreadySet: "Kontrak escrow sudah diatur.",
  GraceNotOver: "Masa tenggang belum selesai.",
  InvalidAccountNonce: "Nonce izin token tidak sesuai. Coba lagi.",
  InvalidShortString: "Data teks tidak valid.",
  InvalidTerms: "Syarat sewa tidak valid.",
  InvalidWindow: "Rentang waktu sewa tidak valid.",
  ItemUnavailable: "Barang ini sedang tidak tersedia.",
  MediatorFrozen: "Penengah sudah disepakati dan tidak bisa diganti.",
  MediatorPending: "Penengah belum diterima. Selesaikan persetujuan penengah dulu.",
  NotAdmin: "Tindakan ini hanya untuk admin.",
  NotEscrow: "Tindakan ini hanya bisa dilakukan oleh escrow.",
  NotMediator: "Hanya penengah yang disepakati yang bisa melakukan tindakan ini.",
  NotOwner: "Hanya pemilik barang yang bisa melakukan tindakan ini.",
  NotParty: "Hanya pemilik atau penyewa yang bisa melakukan tindakan ini.",
  NotRenter: "Hanya penyewa yang bisa melakukan tindakan ini.",
  OpenRentals: "Masih ada sewa yang berjalan.",
  ReentrancyGuardReentrantCall: "Transaksi ditolak oleh kontrak.",
  ResolutionRequired: "Sengketa ini perlu diselesaikan dulu.",
  SafeERC20FailedOperation: "Transfer token gagal. Periksa saldo dan izin.",
  SigExpired: "Tanda tangan sudah kedaluwarsa. Minta tanda tangan baru.",
  StaleOffer: "Tawaran ini sudah tidak berlaku.",
  StartInPast: "Waktu mulai sewa sudah lewat. Pilih waktu baru.",
  StringTooLong: "Data teks tidak valid.",
  TooEarly: "Pengambilan belum dibuka. Tunggu sampai waktu mulai sewa.",
  TooLate: "Waktu pengambilan sudah lewat.",
  TransferLocked: "Barang ini masih terkunci dalam sewa.",
  WindowClosed: "Jendela waktu untuk tindakan ini sudah ditutup.",
  WindowOpen: "Jendela waktu untuk tindakan ini masih terbuka.",
  ZeroAddress: "Alamat yang dipakai tidak valid.",
  ZeroPayment: "Jumlah pembayaran tidak boleh nol.",
};

const FALLBACK = "Transaksi ditolak oleh kontrak. Periksa status sewa, lalu coba lagi.";

function errorDataCandidates(text: string): Hex[] {
  const found: Hex[] = [];
  for (const match of text.matchAll(/0x[0-9a-fA-F]+/g)) {
    const hex = match[0];
    const bytes = (hex.length - 2) / 2;
    if (!Number.isInteger(bytes) || bytes < 4) continue;
    if (bytes === 4 || (bytes - 4) % 32 === 0) found.push(hex as Hex);
  }
  return found;
}

function textsFrom(error: unknown): string[] {
  const texts: string[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    const record = value as Record<string, unknown>;
    for (const key of ["data", "raw", "shortMessage", "message", "details"]) {
      const item = record[key];
      if (typeof item === "string" && item.length > 0) texts.push(item);
    }
    if (Array.isArray(record.metaMessages)) {
      for (const item of record.metaMessages) {
        if (typeof item === "string" && item.length > 0) texts.push(item);
      }
    }
    visit(record.cause);
  };
  visit(error);
  return texts;
}

function decodeName(data: Hex, abis: readonly Abi[]): string | null {
  for (const abi of abis) {
    try {
      return decodeErrorResult({ abi, data }).errorName;
    } catch {
      // Try the next contract ABI. Selectors are unique within one ABI.
    }
  }
  return null;
}

function abiList(abis: Abi | readonly Abi[]): readonly Abi[] {
  if (Array.isArray(abis) && (abis.length === 0 || Array.isArray(abis[0]))) return abis;
  return [abis as Abi];
}

/** Readable contract revert text, or null when the error is not a custom revert. */
export function contractErrorText(error: unknown, abis: Abi | readonly Abi[]): string | null {
  const list = abiList(abis);
  const texts = textsFrom(error);
  let sawRevertData = false;
  for (const text of texts) {
    for (const data of errorDataCandidates(text)) {
      sawRevertData = true;
      const name = decodeName(data, list);
      if (name) return ERROR_TEXT[name] ?? `Transaksi ditolak oleh kontrak (${name}).`;
    }
  }
  return sawRevertData ? FALLBACK : null;
}
