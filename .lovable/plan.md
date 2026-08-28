# Cloud Game Library — games save hongi hamesha ke liye

Abhi har ROM sirf uploader ke apne phone/browser (IndexedDB) me save hoti hai. Iska matlab: dusra banda ya dusra device us game ko nahi khel sakta. Plan: ek **public cloud library** banani hai — jo bhi ROM upload kare, wo sabke liye hamesha available rahe, aur koi bhi use single player ya multiplayer me khel sake.

## Kya banega

1. **Public Library page (`/library`)**
   - Saari uploaded games grid me: cover image, game ka naam, system (Arcade / PS1 / PSP / SNES...), size, kitni baar khela gaya.
   - Search + system filter.
   - Har card pe do buttons: **Solo khelo** aur **Room banao (2 player)**.

2. **Upload — koi bhi, bina login**
   - Upload form: ROM file (.zip/.iso/.cso/.bin/.7z etc.), optional cover image, optional title.
   - Bade files ke liye chunked resumable upload with progress bar (1 GB+ tak support).
   - Duplicate protection: same file dobara upload nahi hogi (hash/size+name check).
   - Rate-limit + extension/size validation taki spam na ho.

3. **Shared BIOS library**
   - BIOS files (PS1 scph1001.bin, PSP etc.) bhi cloud me upload hongi aur sabke liye available.
   - Game boot karte waqt uska system dekh kar sahi BIOS apne aap attach ho jayega — user ko kuch select nahi karna padega.

4. **Solo (single player) mode**
   - Naya route `/play/$gameId` — emulator direct chalega, koi room/WebRTC nahi.
   - Wahi on-screen controls (analog stick + △○✕□ + L1/L2/R1/R2) jo abhi hain.
   - "Invite Player 2" button — solo se seedha multiplayer room me switch.

5. **Multiplayer library se**
   - Room banate waqt library se game choose kar sakte ho (ya apni file upload kar sakte ho, jaisa abhi hai).
   - Guest ko sirf room code chahiye — wahi flow.

6. **Smart caching**
   - Cloud se download hui game device pe IndexedDB me cache ho jayegi (jo abhi wala romStore hai), taki dobara khelte waqt turant chale.
   - Library card pe "Downloaded" badge; cache clear karne ka option.

## Technical details

- **Storage**: nayi public bucket `game-roms` (1 GB per-file limit — project-wide limit se zyada nahi ja sakta; agar reject hua to user ko batayenge) aur `game-covers`.
- **DB**: `public.games` table — `id`, `title`, `file_name`, `storage_path`, `size_bytes`, `core` (detected), `system_label`, `cover_path`, `kind` ('rom' | 'bios'), `content_hash` (unique), `play_count`, `created_at`.
  - RLS: `anon`/`authenticated` ko SELECT allowed; INSERT/UPDATE server function ke through hi (service role), taki koi arbitrary row na daale.
  - GRANTs: SELECT to `anon`+`authenticated`, ALL to `service_role`.
- **Storage policies**: `game-roms`/`game-covers` pe public read; direct anon INSERT allowed sirf ek `uploads/` prefix pe, aur registration server function se hoga.
- **Server functions** (`src/lib/games.functions.ts`): `registerGameFn` (upload complete hone ke baad row banata hai, hash duplicate check karta hai, extension + size validate karta hai), `listGamesFn`, `bumpPlayCountFn`. Zod validation `games.shared.ts` me.
- **Upload client** (`src/lib/gameLibrary.ts`): browser se Supabase storage me chunked upload with progress; core detection existing `coreCandidates()` se; cover fallback existing `src/lib/covers.ts` se.
- **Emulator**: `startEmulator` me koi change nahi — cloud file download hoke `File` object banti hai (naam preserve, romset detection intact) aur wahi pass hoti hai.
- Routes: naya `/library`, naya `/play/$gameId`; `HostStation` me "library se game choose karo" picker; sabme apne unique `head()` meta tags.

## Note

Copyright: library public hai to koi bhi ROM daal sakta hai. Report/remove button aur admin delete ka basic option bhi add kar dunga taki galat file hataayi ja sake.
