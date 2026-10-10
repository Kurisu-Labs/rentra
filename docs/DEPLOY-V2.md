# Rentra v2 — runbook deployment Ethereum Sepolia

**Current status:** instance v2 sudah dideploy dan diverifikasi; lihat [DEPLOYMENT-V2.md](DEPLOYMENT-V2.md). Alamat committed sekarang v2. Langkah deployment di bawah akan membuat instance baru dan hanya dijalankan bila itu memang diinginkan. Tidak ada migrasi dana atau reputasi v1. Uji rental multi-wallet dan publikasi frontend masih terpisah.

Untuk memeriksa instance yang sudah committed tanpa transaksi atau perubahan file:

```bash
cd /home/rakhargo/projects/rentra/app
npm run verify:deployment -- --candidate src/deployments/sepolia.json
```

Perintah ini tidak membutuhkan RPC ber-credential. Jika `SEPOLIA_RPC_URL` kosong, verifier memakai `https://ethereum-sepolia-rpc.publicnode.com` (default yang sama dengan `NEXT_PUBLIC_SEPOLIA_RPC_URL`) dan mencetak URL yang dipakai. Set `SEPOLIA_RPC_URL` untuk menimpa endpoint; log hanya menampilkan host bila URL berisi credential. Pemeriksaan onchain tidak dilonggarkan.

## 1. Persiapan

Gunakan branch `feature/rental-safety-v2`, Node.js 22, dan Foundry. CI memakai Foundry v1.8.5; implementasi juga diuji lokal dengan Foundry 1.5.1 dan Solidity 0.8.28. Pastikan working tree bersih sebelum mulai. Jangan pull/reset di checkout yang memiliki perubahan lokal.

```bash
cd /home/rakhargo/projects/rentra
git status --short
node --version
forge --version

cd contracts
forge build
forge test

cd ../app
npm ci
npm test
npm run build
```

Import wallet deployer ke **keystore terenkripsi**, bila belum tersedia. Private key dan password dimasukkan melalui prompt lokal; jangan letakkan nilainya di chat, argumen command line, screenshot, atau commit.

```bash
cast wallet import rentra-v2-deployer --interactive
```

Catat alamat publiknya. Account ini akan menjadi admin escrow, NFT, dan reputation. Admin reputation bertanggung jawab memilih pemilik yang layak mendapat kredit diskon; admin tidak bisa menarik dana escrow.

```bash
export DEPLOYER_ADDRESS="$(cast wallet address --account rentra-v2-deployer)"
export SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
export RENTRA_DEMO_MODE=false
unset DEPLOYER_PRIVATE_KEY

cast chain-id --rpc-url "$SEPOLIA_RPC_URL"
cast balance "$DEPLOYER_ADDRESS" --ether --rpc-url "$SEPOLIA_RPC_URL"
```

Expected chain: **11155111**. Wallet memerlukan Sepolia ETH untuk gas, bukan ETH mainnet. Jika memakai `contracts/.env`, hapus signer legacy yang masih terisi agar tidak menggantikan keystore pilihanmu. RPC ber-API-key hanya disimpan lokal. Untuk `--verify`, sediakan `ETHERSCAN_API_KEY` di environment lokal; nilainya tidak perlu dimasukkan dalam command line.

Konfigurasi explorer memakai [endpoint verifikasi Etherscan V2](https://docs.etherscan.io/api-reference/endpoint/verifysourcecode) dengan chain ID Sepolia, sesuai [daftar chain resmi](https://api.etherscan.io/v2/chainlist).

## 2. Dry run: belum ada transaksi

```bash
cd /home/rakhargo/projects/rentra/contracts
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --sender "$DEPLOYER_ADDRESS" \
  --slow
```

Periksa estimasi kebutuhan gas dan pastikan saldo cukup dengan margin. Perintah tanpa `--broadcast` hanya simulasi. Script menulis **`contracts/deployments/sepolia.candidate.json`**, yang diabaikan Git. Dua manifest utama tetap v1. Candidate adalah alamat yang diperkirakan, bukan bukti kontrak sudah live. Nonce deployer dapat berubah; hasil broadcast berikutnya menjadi candidate yang berlaku.

## 3. Broadcast dan source verification

```bash
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$SEPOLIA_RPC_URL" \
  --account rentra-v2-deployer \
  --sender "$DEPLOYER_ADDRESS" \
  --broadcast --slow --verify
```

Masukkan password keystore melalui prompt lokal. Pastikan empat creation transaction dan dua transaksi `setEscrow` sukses. Catat hash transaksi dan hasil source verification setiap kontrak. Jangan membagikan folder `contracts/cache/`: Foundry dapat menyimpan nilai sensitif di sana.

Output bantuan CLI dapat mencantumkan default dari environment. Jangan membagikan output mentah sebelum memastikan API key, RPC ber-API-key, dan credential lain tidak ikut tercetak.

Jika broadcast terputus, periksa receipt dan nonce terlebih dahulu. `--resume` hanya untuk transaksi dari run yang sama dengan nonce yang sesuai; jangan menjalankan deployment baru berulang kali untuk mengatasi error. Jika hanya source verification yang gagal, selesaikan verifikasi kontrak yang sudah ada, bukan deploy ulang. Jangan lanjut promosi candidate sampai semua alamat dan hasil verifikasi jelas.

## 4. Verifikasi onchain, lalu promosi alamat

Verifier mengecek chain, bytecode di empat alamat, protocol v2, admin, cross-contract references, demo mode, dan metadata mIDR pada satu snapshot block. Tidak ada private key yang diperlukan. RPC publik di atas cukup bila `SEPOLIA_RPC_URL` tidak di-set; baris log menyebut endpoint yang benar-benar dipakai.

```bash
cd /home/rakhargo/projects/rentra/app
npm run verify:deployment
```

Expected: `Verified protocol v2 ... manifests remain unchanged`. Jika tidak ada bytecode atau konfigurasi salah, verifier gagal dan tidak mempromosikan alamat. Verifikasi ini tidak menggantikan pemeriksaan source di explorer.

Setelah source verification dan receipt sudah diperiksa:

```bash
npm run verify:deployment -- --promote
git diff -- ../contracts/deployments/sepolia.json src/deployments/sepolia.json
```

Expected: kedua file berisi deployment yang sama, `protocolVersion: 2`, deployer yang benar, dan block verifikasi. Verifier menolak promosi dari Anvil/Hardhat/Ganache. Jika proses file promotion terputus, periksa kedua file dan sinkronkan sebelum lanjut. Jangan commit candidate, keystore, cache, RPC ber-API-key, atau `.env`.

## 5. Uji penerimaan dengan wallet terpisah

Gunakan wallet pemilik, penyewa, dan penengah yang berbeda. Isi masing-masing dengan Sepolia ETH. mIDR dari faucet tidak punya nilai uang nyata.

| Alur | Hasil yang harus terlihat |
| --- | --- |
| Pemilik membuat listing dengan floor 50% | Persetujuan risiko wajib; penyewa baru tetap membayar 100% nilai barang |
| Booking lalu pilih penengah | Pemilik mengusulkan; penyewa menerima; pilihan tidak bisa diganti setelah diterima |
| Serah terima | Penyewa menandatangani payload dengan mediator yang benar; pemilik mengirim transaksi |
| Pengembalian tanpa tanda tangan pemilik | Status pending; dana dan reputasi tidak berubah |
| Pemilik acknowledge | Sewa/denda dibayar; deposit menunggu claim window 24 jam nyata |
| Sengketa pengembalian | Pemilik memberikan hash bukti; tidak ada payout otomatis berdasarkan diam |
| Settlement bersama | Satu pihak menawarkan; pihak lain menerima jumlah persis; tidak bisa menerima tawaran sendiri atau counter yang sudah diganti |
| Keputusan penengah | Hanya penengah yang diterima bisa membagi dana rental tersebut; jumlah dibatasi deposit/klaim |
| Klaim kerusakan diterima | Bond dan deposit dibagi sesuai aturan; tidak mendapat kredit sukses |
| Return bersih tanpa klaim | Setelah 24 jam nyata, transaksi finalize mengembalikan sisa deposit dan mencatat reputasi sekali |
| Non-return | Sesudah end + grace, gunakan jalur default atau keputusan penengah untuk return yang disengketakan |

Sewa dari pemilik yang belum disetujui tetap tercatat tetapi tidak menghasilkan diskon. Untuk pilot, admin boleh menyetujui pemilik yang benar-benar telah direview melalui `Reputation.setOwnerApproval(owner, true)`. Jangan menganggap beberapa alamat wallet sebagai bukti beberapa orang.

Mode demo mempercepat **rental deadlines** saja. Claim window tetap 24 jam nyata; jangan mengklaim alur finalisasi ini sudah diuji di Sepolia sebelum waktunya lewat. Demo settlement cepat dapat memakai kesepakatan kedua pihak pada klaim/return request, atau Anvil untuk pengujian time travel; bedakan hasil lokal dan Sepolia dalam laporan.

## 6. Publish frontend setelah uji lulus

Jalankan lagi `npm test` dan `npm run build` setelah alamat diperbarui. Di Vercel gunakan root `app`, Node 22, install `npm ci`, build `npm run build`. Hapus override alamat v1 yang masih tertinggal, atau pastikan keempat override menunjuk satu deployment v2 yang konsisten. Jangan memasukkan private key atau Etherscan key ke `NEXT_PUBLIC_*`.

Commit alamat yang sudah diverifikasi terpisah, misalnya `chore(deployments): record verified Sepolia v2 instance`, push branch, dan tunggu CI. Simpan bukti transaksi serta hasil wallet test. Review/merge PR dan publish dilakukan setelah hasil tersebut siap. Jangan mengubah deployment v1 untuk memindahkan dana; pengguna lama masih bergantung pada kontrak lamanya.

Jika frontend v2 menampilkan `Read-only mode`, periksa protocol version, chain, semua alamat, serta kedua referensi escrow. Jangan melewati guard untuk membuat tombol aktif. Sengketa tanpa kesepakatan atau penengah responsif masih dapat menahan dana; belum ada asuransi, penjamin yang didanai, atau layanan arbitrase yang disediakan.
