# I18N review: Hungarian and Korean

All Hungarian (`hu`) and Korean (`ko`) strings were written by the developer (an AI assistant), not by native speakers. Please review every line below. Edit the catalogs in `src/shared/i18n/<locale>.json` and the rule templates in `src/shared/ruleTemplates.ts`; this file is generated from them (see the bottom of this page).

## Things to check first

- **Company names.** Korean uses transliterations (오픈 시큐리티, 코요테크, …) because the show's original Korean names could not be confirmed. Hungarian keeps the brand part in English and translates the descriptor (Latter Elektronika, Defense Acél, …). Replace them with the broadcast names if known.
- **Game title.** `app.name` is 미스터리 거래소 (the show's name for the game) in Korean and Rejtélyes Tőzsde in Hungarian.
- **Show credit** (`how.credit`): the Korean title of *The Devil's Plan* season 3 is written generically as 〈데블스 플랜〉 시즌 3.
- **Currency.** Mystery Mark is 미스터리 마크 / Rejtélymárka; the symbol ℳ goes before the number in `en`/`ko` and after it in `hu` (`currency.pattern`).
- **Hungarian articles.** Where a stock name follows an article the code picks `a`/`az` automatically (`{theA}` in rule templates). UI strings avoid `a(z)` by rephrasing; check they still read naturally.
- **Korean particles.** Rule templates pick 이/가 automatically (`{aSubj}`). UI strings that would need 을/를 or 이/가 after a stock name were rephrased as `label: {stock}`.
- **Reveal groups.** Each rule's tokens must reveal the *same information* at the same round in every language (group 0 at the start, 1 at round 5, 2 at 10, 3 at 15, 4 at 20). Word order may differ; the group of each piece of information must not.
- **Terms of art.** 피스 (piece), 비밀 (secret); in Hungarian the secret mechanic is called **elrejtés** („Részvény elrejtése”), and pieces are **zseton**.

## UI strings

| Key | English | Magyar | 한국어 |
|---|---|---|---|
| `currency.pattern` | {symbol}{amount} | {amount} {symbol} | {symbol}{amount} |
| `currency.name` | Mystery Mark | Rejtélymárka | 미스터리 마크 |
| `currency.name_one` | mark | márka | 마크 |
| `currency.name_other` | marks | márka | 마크 |
| `stock.open` | Open Security | Open Security | 오픈 시큐리티 |
| `stock.coyo` | CoyoTech | CoyoTech | 코요테크 |
| `stock.latter` | Latter Electronics | Latter Elektronika | 래터 전자 |
| `stock.defense` | Defense Steel | Defense Acél | 디펜스 철강 |
| `stock.airtight` | Airtight Construction | Airtight Építő | 에어타이트 건설 |
| `stock.seasoned` | Seasoned Financial | Seasoned Pénzügyi | 시즌드 금융 |
| `stock.alt` | Alt Entertainment | Alt Szórakoztató | 알트 엔터테인먼트 |
| `app.name` | Mystery Stock Market | Rejtélyes Tőzsde | 미스터리 거래소 |
| `lang.en` | English | English | English |
| `lang.hu` | Magyar | Magyar | Magyar |
| `lang.ko` | 한국어 | 한국어 | 한국어 |
| `common.bot` | bot | bot | 봇 |
| `common.host` | host | házigazda | 호스트 |
| `common.you` | you | te | 나 |
| `common.frozen` | frozen | fagyasztva | 동결 |
| `common.cancel` | Cancel | Mégse | 취소 |
| `common.close` | Close | Bezárás | 닫기 |
| `common.home` | Back to home | Vissza a kezdőlapra | 처음으로 |
| `common.language` | Language | Nyelv | 언어 |
| `common.settings` | Settings | Beállítások | 설정 |
| `common.working` | One moment… | Egy pillanat… | 잠시만요… |
| `conn.connecting` | Connecting… | Csatlakozás… | 연결 중… |
| `conn.reconnecting` | Connection lost. Reconnecting… | Megszakadt a kapcsolat. Újracsatlakozás… | 연결이 끊겼습니다. 다시 연결하는 중… |
| `home.overline` | Party game · 2–16 players | Társasjáték · 2–16 játékos | 파티 게임 · 2–16명 |
| `home.tagline` | Seven companies, 24 rounds, and price rules nobody has read yet. The rules reveal themselves word by word — trade before everyone else works them out. | Hét cég, 24 kör és árfolyamszabályok, amelyeket még senki sem olvasott. A szabályok szóról szóra derülnek ki — kereskedj, mielőtt a többiek rájönnek. | 일곱 개의 회사, 24라운드, 아직 아무도 읽지 못한 주가 규칙. 규칙은 한 단어씩 공개됩니다. 남들이 알아내기 전에 거래하세요. |
| `home.createTitle` | Create a room | Szoba létrehozása | 방 만들기 |
| `home.createBody` | You host. Friends join from their phones; any TV with a browser can show the board. | Te vagy a házigazda. A barátaid telefonról csatlakoznak, a táblát bármelyik böngészős tévé megjelenítheti. | 내가 호스트가 됩니다. 친구들은 휴대폰으로 참가하고, 브라우저가 있는 TV라면 어디서든 보드를 띄울 수 있어요. |
| `home.create` | Create room | Szoba létrehozása | 방 만들기 |
| `home.joinTitle` | Join with a code | Csatlakozás kóddal | 코드로 참가 |
| `home.joinBody` | Enter the five-letter code shown on the host's phone or the TV. | Írd be a házigazda telefonján vagy a tévén látható ötjegyű kódot. | 호스트의 휴대폰이나 TV에 보이는 다섯 자리 코드를 입력하세요. |
| `home.codeLabel` | Room code | Szobakód | 방 코드 |
| `home.join` | Join | Csatlakozás | 참가 |
| `home.companies` | Seven companies on the board | Hét cég a táblán | 보드에 오른 일곱 회사 |
| `home.tvLink` | Show on a TV | Megjelenítés tévén | TV에 띄우기 |
| `home.solo` | Practice solo against bots | Gyakorlás egyedül botok ellen | 봇과 혼자 연습하기 |
| `join.overline` | Joining room | Csatlakozás a szobához | 방에 참가 |
| `join.nameLabel` | Your name | A neved | 이름 |
| `join.namePlaceholder` | 1–16 characters | 1–16 karakter | 1–16자 |
| `join.submit` | Join the game | Belépek a játékba | 게임 참가 |
| `join.hint` | {n} already in the room. | {n} ember van már a szobában. | 이미 {n}명이 방에 있습니다. |
| `lobby.roomCode` | Room code | Szobakód | 방 코드 |
| `lobby.scanToJoin` | Scan to join | Olvasd be a csatlakozáshoz | 스캔해서 참가 |
| `lobby.copyLink` | Copy join link | Csatlakozási link másolása | 참가 링크 복사 |
| `lobby.copied` | Copied | Kimásolva | 복사됨 |
| `lobby.players` | Players | Játékosok | 플레이어 |
| `lobby.seats` | {n}/{max} seats | {n}/{max} hely | {n}/{max}석 |
| `lobby.online` | Online | Online | 접속 중 |
| `lobby.offline` | Offline | Offline | 오프라인 |
| `lobby.notPlaying` | not playing | nem játszik | 불참 |
| `lobby.kick` | Kick | Kirúgás | 내보내기 |
| `lobby.addBot` | Add a bot | Bot hozzáadása | 봇 추가 |
| `lobby.removeBot` | Remove | Eltávolítás | 제거 |
| `lobby.settings` | Game settings | Játékbeállítások | 게임 설정 |
| `lobby.start` | Start game | Játék indítása | 게임 시작 |
| `lobby.needPlayers` | You need at least {min} seats to start. Add a bot or invite someone. | Legalább {min} hely kell az induláshoz. Adj hozzá egy botot, vagy hívj meg valakit. | 시작하려면 최소 {min}석이 필요합니다. 봇을 추가하거나 친구를 초대하세요. |
| `lobby.humans_one` | {n} human player | {n} emberi játékos | 사람 플레이어 {n}명 |
| `lobby.humans_other` | {n} human players | {n} emberi játékos | 사람 플레이어 {n}명 |
| `lobby.waiting` | Waiting for the host to start… | Várakozás, hogy a házigazda elindítsa… | 호스트가 시작하기를 기다리는 중… |
| `set.gameLang` | Game language | A játék nyelve | 게임 언어 |
| `set.gameLangHint` | Once the game starts, every phone and the TV use this language, so everyone reads the same rule wording. It can't be changed until the game ends. | A játék indulásától minden telefon és a tévé ezt a nyelvet használja, így mindenki ugyanazt a szabályszöveget olvassa. A játék végéig nem módosítható. | 게임이 시작되면 모든 휴대폰과 TV가 이 언어를 사용하므로 모두가 같은 규칙 문구를 읽습니다. 게임이 끝날 때까지 바꿀 수 없습니다. |
| `set.gameLangChip` | Game in {lang} | Játék nyelve: {lang} | 게임 언어: {lang} |
| `set.langLocked` | {lang} for this game (set by the host). You can change it again after the game. | Ebben a játékban: {lang} (a házigazda állította be). A játék után újra módosíthatod. | 이번 게임은 {lang}(호스트가 설정). 게임이 끝나면 다시 바꿀 수 있습니다. |
| `set.ruleSet` | Rule set | Szabálykészlet | 규칙 세트 |
| `set.ruleShow` | Show's rules | A műsor szabályai | 방송 규칙 |
| `set.ruleRandom` | Randomized | Véletlenszerű | 무작위 |
| `set.roundLength` | Round length | Kör hossza | 라운드 시간 |
| `set.seconds` | {n} s | {n} mp | {n}초 |
| `set.noLimit` | No limit | Nincs limit | 무제한 |
| `set.noLimitHint` | No timer: each round ends when every player presses Ready (or when the host ends it). | Nincs időzítő: a kör akkor ér véget, ha minden játékos megnyomja a Kész gombot (vagy ha a házigazda lezárja). | 타이머 없음: 모든 플레이어가 준비를 누르면(또는 호스트가 끝내면) 라운드가 끝납니다. |
| `set.gameCap` | Games end automatically after {hours} hours. | A játék {hours} óra után automatikusan véget ér. | 게임은 {hours}시간이 지나면 자동으로 끝납니다. |
| `game.noLimitHint` | No time limit: the round ends when every player is ready. | Nincs időkorlát: a kör akkor ér véget, ha minden játékos kész. | 시간 제한 없음: 모든 플레이어가 준비되면 라운드가 끝납니다. |
| `ev.ev_time_limit` | The {hours}-hour limit was reached, so the game ended. | Elérte a {hours} órás korlátot, ezért a játék véget ért. | {hours}시간 제한에 도달해 게임이 끝났습니다. |
| `set.endEarly` | End rounds early when everyone is ready | A kör érjen véget, ha mindenki kész | 모두 준비되면 라운드를 일찍 종료 |
| `set.endEarlyShort` | Ends early when all ready | Korábban zár, ha mindenki kész | 모두 준비 시 조기 종료 |
| `set.hostPlays` | I'm playing too | Én is játszom | 나도 플레이 |
| `set.bots_one` | {n} bot | {n} bot | 봇 {n}개 |
| `set.bots_other` | {n} bots | {n} bot | 봇 {n}개 |
| `set.botSkill` | Bot skill | Botok szintje | 봇 난이도 |
| `set.roomLang` | Room language (TV default) | Szoba nyelve (tévé alapértelmezés) | 방 언어 (TV 기본값) |
| `set.seed` | Seed (optional) | Seed (nem kötelező) | 시드 (선택) |
| `set.seedPlaceholder` | Random if empty | Üresen véletlenszerű | 비우면 무작위 |
| `skill.easy` | Easy | Könnyű | 쉬움 |
| `skill.normal` | Normal | Közepes | 보통 |
| `skill.hard` | Hard | Nehéz | 어려움 |
| `game.rules` | Rules | Szabályok | 규칙 |
| `game.rulesHint` | One rule per company. Grey bars are hidden words; striped bars are revealed next (rounds 5, 10, 15 and 20). | Cégenként egy szabály. A szürke sávok rejtett szavak; a csíkosak derülnek ki legközelebb (5., 10., 15. és 20. kör). | 회사마다 규칙 하나. 회색 막대는 가려진 단어이고, 줄무늬 막대는 다음에 공개됩니다(5, 10, 15, 20라운드). |
| `game.round` | Round | Kör | 라운드 |
| `game.roundOf` | Round {r} of {n} | {r}. kör / {n} | {n}라운드 중 {r}라운드 |
| `game.paused` | Paused | Szünet | 일시 정지 |
| `game.pausedBanner` | The host paused the game. Trading resumes when they continue. | A házigazda szüneteltette a játékot. A kereskedés folytatódik, amint továbblép. | 호스트가 게임을 일시 정지했습니다. 다시 시작하면 거래가 재개됩니다. |
| `game.revealAt` | Reveal R{r} | Felfedés: {r}. kör | {r}R 공개 |
| `game.nextRevealHint` | More words of every rule are revealed at the start of this round. | Ennek a körnek az elején minden szabályból újabb szavak derülnek ki. | 이 라운드가 시작되면 모든 규칙의 단어가 더 공개됩니다. |
| `game.ready` | Ready | Kész | 준비 |
| `game.readyBig` | Ready — end my turn | Kész — befejeztem a kört | 준비 — 내 차례 끝내기 |
| `game.readyDone` | Ready | Kész | 준비 완료 |
| `game.readyWaiting` | Waiting for the others · {n}/{total} ready · click to undo | Várakozás a többiekre · {n}/{total} kész · kattints a visszavonáshoz | 다른 플레이어를 기다리는 중 · {n}/{total} 준비 · 다시 누르면 취소 |
| `game.readyHintEnds` | When everyone is ready, the round settles. | Ha mindenki kész, a kör elszámolásra kerül. | 모두 준비되면 라운드가 정산됩니다. |
| `game.readyHintTimer` | Tells the others you're done; the round ends when the timer runs out. | Jelzi a többieknek, hogy végeztél; a kör az idő lejártakor ér véget. | 다른 사람에게 끝났음을 알립니다. 라운드는 시간이 다 되면 끝납니다. |
| `game.readyOn` | Ready ✓ | Kész ✓ | 준비 ✓ |
| `game.readyMark` | ready | kész | 준비 |
| `game.readyCount` | {n}/{total} ready | {n}/{total} kész | {n}/{total} 준비 |
| `game.settlingIn` | Everyone is ready — settling in {s}… | Mindenki kész — elszámolás {s} mp múlva… | 모두 준비 완료 — {s}초 후 정산… |
| `game.secretActive` | A secret is active: net worth is hidden in the standings. | Egy részvény el van rejtve, ezért az állásban most nem látszik a nettó vagyon. | 비밀이 작동 중입니다: 순위표의 자산이 가려집니다. |
| `game.secretShort` | secret active | elrejtett részvény | 비밀 작동 중 |
| `game.startingIn` | Starting in | Indulás | 시작까지 |
| `game.standings` | Standings | Állás | 순위 |
| `game.watching` | You are watching. Prices, rules and standings update live. | Nézőként vagy itt. Az árak, a szabályok és az állás élőben frissül. | 관전 중입니다. 가격, 규칙, 순위가 실시간으로 갱신됩니다. |
| `stock.hidden` | hidden | rejtve | 가려짐 |
| `stock.hiddenHint` | Hidden by a secret | Valaki elrejtette | 비밀로 가려짐 |
| `stock.up` | up | emelkedett | 상승 |
| `stock.down` | down | esett | 하락 |
| `stock.flat` | unchanged | változatlan | 보합 |
| `stock.youHold` | you hold {n} | {n} db nálad | {n}주 보유 |
| `stock.lastRound` | Last round: | Előző kör: | 지난 라운드: |
| `stock.buyVol` | bought | vétel | 매수 |
| `stock.sellVol` | sold | eladás | 매도 |
| `stock.holdings` | held | állomány | 보유 |
| `stock.position` | Your shares: {n} | Részvényeid: {n} db | 내 보유: {n}주 |
| `stock.qty` | Quantity | Mennyiség | 수량 |
| `stock.max` | Max | Max | 최대 |
| `stock.maxUnknown` | Unknown while your cash or this price is hidden | Nem számolható, amíg a készpénzed vagy ez az ár rejtve van | 현금이나 이 가격이 가려진 동안은 알 수 없음 |
| `stock.all` | All | Mind | 전부 |
| `stock.buy` | Buy | Vétel | 매수 |
| `stock.sell` | Sell | Eladás | 매도 |
| `stock.notes` | Private notes | Saját jegyzetek | 개인 메모 |
| `stock.notesPlaceholder` | Only on this device | Csak ezen az eszközön | 이 기기에만 저장 |
| `rule.hidden` | Hidden words | Rejtett szavak | 가려진 단어 |
| `rule.nextReveal` | Revealed next | Ez derül ki legközelebb | 다음에 공개 |
| `rule.peeked` | You peeked at this | Ezt kikukucskáltad | 엿본 내용 |
| `desk.title` | Your account | A számlád | 내 계좌 |
| `desk.cash` | Cash | Készpénz | 현금 |
| `desk.net` | Net worth | Nettó vagyon | 총자산 |
| `desk.cashDeltaHint` | Change in cash since this round began | A készpénz változása a kör eleje óta | 이번 라운드 시작 이후 현금 변화 |
| `desk.netDeltaHint` | Change in net worth since the last settlement | A nettó vagyon változása az előző elszámolás óta | 직전 정산 이후 총자산 변화 |
| `desk.pieces` | Pieces | Zsetonok | 피스 |
| `desk.secret` | Secret | Elrejtés | 비밀 |
| `desk.secretUnused` | Not used yet | Még nem használtad | 아직 사용 안 함 |
| `desk.secretUsed` | {stock}, round {r} | {stock}, {r}. kör | {stock}, {r}라운드 |
| `desk.placeSecret` | Place secret | Részvény elrejtése | 비밀 걸기 |
| `desk.secretHint` | Hide one stock from everyone for the next two rounds. One per game, anonymous. | Egy részvényt a következő két körre mindenki elől elrejtesz. Játékonként egyszer teheted meg, és senki sem tudja meg, hogy te voltál. | 다음 두 라운드 동안 한 종목을 모두에게서 가립니다. 게임당 한 번, 익명입니다. |
| `desk.secretConfirm` | Hide {stock} during rounds {from} and {to}? You can only do this once per game. | {stock} a következő két körben ({from}. és {to}. kör) senki számára nem lesz látható. Ezt játékonként csak egyszer teheted meg. | 가릴 종목: {stock} ({from}·{to}라운드). 게임당 한 번만 할 수 있습니다. |
| `desk.secretGo` | Place secret | Elrejtem | 비밀 걸기 |
| `desk.peek` | Peek | Kukucskálás | 엿보기 |
| `desk.peekHint` | Spend a piece to see the next hidden words of one rule, privately. | Egy zsetonért titokban megnézheted egy szabály következő rejtett szavait. | 피스를 하나 써서 한 규칙의 다음 가려진 단어를 혼자 봅니다. |
| `desk.cashIn` | Cash in {amount} | Beváltás: {amount} | {amount} 현금화 |
| `desk.cashTitle` | Cash in a piece | Zseton beváltása | 피스 현금화 |
| `desk.cashConfirm` | Spend 1 of your {n} pieces to get {amount} in cash, added right away. A piece can instead buy a private peek at the next hidden words of a rule, so choose wisely. Pieces can be used until the end of round 20. | Elköltesz egy zsetont (jelenleg ennyi van: {n}), és azonnal {amount} készpénzt kapsz. Egy zsetonért ehelyett titokban bekukucskálhatsz egy szabály következő rejtett szavaiba, úgyhogy jól gondold meg. A zsetonok a 20. kör végéig használhatók. | 보유한 피스 {n}개 중 1개를 쓰면 즉시 현금으로 받습니다: {amount}. 피스는 대신 규칙의 다음 가려진 단어를 몰래 엿보는 데 쓸 수도 있으니 신중히 고르세요. 피스는 20라운드가 끝날 때까지 쓸 수 있습니다. |
| `desk.cashGo` | Spend a piece for {amount} | Beváltás: {amount} | 피스 사용: {amount} |
| `desk.piecesClosed` | Pieces could be used until the end of round 20. | A zsetonokat a 20. kör végéig lehetett használni. | 피스는 20라운드가 끝날 때까지 쓸 수 있었습니다. |
| `desk.blind` | You hold a hidden stock, so your cash and net worth are hidden until it reappears. You can still trade. | Van nálad egy elrejtett részvény, ezért a készpénzed és a nettó vagyonod sem látszik, amíg újra elő nem bukkan. Kereskedni ettől még tudsz. | 가려진 종목을 보유 중이라 다시 공개될 때까지 내 현금과 총자산이 가려집니다. 거래는 계속할 수 있습니다. |
| `desk.frozen` | Frozen | Fagyasztva | 동결됨 |
| `feed.title` | Market feed | Piaci hírek | 시장 소식 |
| `feed.empty` | Nothing yet. | Még semmi. | 아직 없음. |
| `trade.bought` | Bought | Vétel: | 매수 |
| `trade.sold` | Sold | Eladás: | 매도 |
| `host.menu` | Host | Házigazda | 호스트 |
| `host.title` | Host controls | Házigazda vezérlői | 호스트 메뉴 |
| `host.round` | Game | Játék | 게임 |
| `host.pause` | Pause | Szünet | 일시 정지 |
| `host.resume` | Resume | Folytatás | 재개 |
| `host.endRound` | End round now | Kör lezárása most | 지금 라운드 종료 |
| `host.endGame` | End game | Játék befejezése | 게임 종료 |
| `host.endGameConfirm` | Yes, end the game | Igen, befejezem | 네, 게임을 끝냅니다 |
| `host.tvs` | TVs | Tévék | TV |
| `host.connectTv` | Connect a TV | Tévé csatlakoztatása | TV 연결 |
| `host.tvHint` | Open {url} on the TV and type its code here, or scan the TV's QR with this phone. | Nyisd meg a tévén ezt: {url}, és írd be ide a kódját — vagy olvasd be a tévé QR-kódját ezzel a telefonnal. | TV에서 {url}을(를) 열고 화면의 코드를 여기에 입력하거나, 이 휴대폰으로 TV의 QR 코드를 스캔하세요. |
| `host.tvCodeHint` | Enter the 6-digit code shown on the TV. | Írd be a tévén látható 6 jegyű kódot. | TV에 표시된 6자리 코드를 입력하세요. |
| `host.tvName` | TV {n} | {n}. tévé | TV {n} |
| `host.unpair` | Unpair | Leválasztás | 연결 해제 |
| `host.tvCount_one` | {n} TV connected | {n} tévé csatlakoztatva | TV {n}대 연결됨 |
| `host.tvCount_other` | {n} TVs connected | {n} tévé csatlakoztatva | TV {n}대 연결됨 |
| `host.spectators_one` | {n} spectator | {n} néző | 관전자 {n}명 |
| `host.spectators_other` | {n} spectators | {n} néző | 관전자 {n}명 |
| `host.players` | Players | Játékosok | 플레이어 |
| `host.noPlayers` | No other human players. | Nincs más emberi játékos. | 다른 사람 플레이어가 없습니다. |
| `host.makeHost` | Make host | Legyen ő a házigazda | 호스트 넘기기 |
| `results.overline` | Game over | Vége a játéknak | 게임 종료 |
| `results.title` | Final standings | Végeredmény | 최종 순위 |
| `results.rules` | Every rule, revealed | Minden szabály, teljes egészében | 모든 규칙 공개 |
| `results.seed` | Seed | Seed | 시드 |
| `results.prize` | prize token | nyereményzseton | 상금 토큰 |
| `results.piecesEarned_one` | +{n} piece | +{n} zseton | 피스 +{n} |
| `results.piecesEarned_other` | +{n} pieces | +{n} zseton | 피스 +{n} |
| `results.newGame` | New game with the same players | Új játék ugyanezekkel a játékosokkal | 같은 멤버로 새 게임 |
| `tv.pairCode` | Pairing code | Párosítókód | 연결 코드 |
| `tv.pairHelp` | On the host's phone, open the room's host menu, choose “Connect a TV” and enter this code — or scan the QR code. (Open {url} on any big screen.) | A házigazda telefonján nyisd meg a szoba házigazda-menüjét, válaszd a „Tévé csatlakoztatása” lehetőséget, és írd be ezt a kódot — vagy olvasd be a QR-kódot. (Bármelyik nagy képernyőn nyisd meg: {url}.) | 호스트 휴대폰에서 방의 호스트 메뉴를 열고 ‘TV 연결’을 눌러 이 코드를 입력하거나 QR 코드를 스캔하세요. (아무 큰 화면에서나 {url}을(를) 여세요.) |
| `tv.scanToPair` | Host: scan to show your room here | Házigazda: olvasd be, hogy itt jelenjen meg a szobád | 호스트: 스캔하면 이 화면에 방이 표시됩니다 |
| `pair.overline` | Connect a TV | Tévé csatlakoztatása | TV 연결 |
| `pair.confirm` | Show room {code} on this TV? | Megjelenjen ezen a tévén ez a szoba: {code}? | {code} 방을 이 TV에 띄울까요? |
| `pair.show` | Show it | Mutasd | 띄우기 |
| `pair.done` | The TV is connected. | A tévé csatlakoztatva. | TV가 연결되었습니다. |
| `pair.back` | Back to the room | Vissza a szobába | 방으로 돌아가기 |
| `pair.onlyHost` | Only the host can connect a TV | Csak a házigazda csatlakoztathat tévét | TV는 호스트만 연결할 수 있습니다 |
| `pair.onlyHostBody` | Open this link on the phone that created the room. | Nyisd meg ezt a linket azon a telefonon, amelyik a szobát létrehozta. | 방을 만든 휴대폰에서 이 링크를 여세요. |
| `prefs.colors` | Up / down colors | Emelkedés / esés színei | 상승 / 하락 색상 |
| `prefs.korean` | Korean | Koreai | 한국식 |
| `prefs.western` | Western | Nyugati | 서양식 |
| `solo.overline` | Solo | Egyjátékos | 솔로 |
| `solo.title` | Practice against bots | Gyakorlás botok ellen | 봇과 연습 |
| `solo.body` | Runs entirely in this browser. Nothing is sent to a server. | Teljesen ebben a böngészőben fut. Semmi nem megy a szerverre. | 이 브라우저 안에서만 실행됩니다. 서버로 아무것도 보내지 않습니다. |
| `solo.readyHint` | Press Ready to settle the round immediately. | A Kész gombbal azonnal lezárhatod a kört. | 준비를 누르면 라운드가 바로 정산됩니다. |
| `solo.start` | Start | Indítás | 시작 |
| `rules.overline` | Before you play | Mielőtt játszol | 시작하기 전에 |
| `rules.understand` | I understand | Értem | 이해했습니다 |
| `ex.watch` | Watch the rules | Nézd meg a szabályokat | 규칙 영상 보기 |
| `ex.title` | How to play | Játékszabály | 게임 방법 |
| `ex.play` | Play | Lejátszás | 재생 |
| `ex.pause` | Pause | Szünet | 일시 정지 |
| `ex.restart` | Restart | Újraindítás | 처음부터 |
| `ex.prev` | Previous | Előző | 이전 |
| `ex.next` | Next | Következő | 다음 |
| `ex.mute` | Mute | Némítás | 음소거 |
| `ex.unmute` | Sound on | Hang be | 소리 켜기 |
| `ex.soundBlocked` | Sound is off — click to turn it on | A hang ki van kapcsolva — kattints a bekapcsoláshoz | 소리가 꺼져 있습니다 — 클릭하면 켜집니다 |
| `ex.ended` | That's the game. Watch again? | Ennyi a játék. Megnézed újra? | 게임 설명이 끝났습니다. 다시 볼까요? |
| `ex.tagline` | 7 companies · 24 rounds · hidden rules | 7 cég · 24 kör · rejtett szabályok | 7개 회사 · 24라운드 · 숨겨진 규칙 |
| `ex.s1` | Welcome to the Mystery Stock Market. Seven companies, twenty-four rounds, and every price follows a rule that nobody has read yet. | Üdv a Rejtélyes Tőzsdén! Hét cég, huszonnégy kör, és minden árfolyamot egy olyan szabály mozgat, amelyet még senki sem olvasott. | 미스터리 거래소에 오신 것을 환영합니다. 일곱 개의 회사, 스물네 번의 라운드, 그리고 모든 주가는 아직 아무도 읽지 못한 규칙을 따릅니다. |
| `ex.s2` | Every stock opens at ten thousand marks. You start with one hundred thousand marks in cash and three pieces. | Minden részvény tízezer márkáról indul. Te százezer márka készpénzzel és három zsetonnal kezdesz. | 모든 종목은 만 마크에서 시작합니다. 여러분은 현금 십만 마크와 피스 세 개로 시작합니다. |
| `ex.s3` | In each round, buy and sell whole shares at the round's price. Prices do not move until the round ends. | Minden körben egész részvényeket veszel és adsz el a kör árán. Az árak a kör végéig nem mozdulnak. | 매 라운드 그 라운드의 가격으로 주식을 한 주 단위로 사고팝니다. 라운드가 끝날 때까지 가격은 움직이지 않습니다. |
| `ex.s4` | When the round ends, every stock jumps to a new price at the same moment. | A kör végén minden részvény egyszerre ugrik új árra. | 라운드가 끝나면 모든 종목이 동시에 새 가격으로 바뀝니다. |
| `ex.s5` | Each stock follows its own hidden rule. Only a few words are visible at first. More words are revealed in rounds five, ten, fifteen and twenty. | Minden részvényt a saját rejtett szabálya mozgat. Eleinte csak néhány szó látszik, a többi az ötödik, tizedik, tizenötödik és huszadik körben derül ki. | 각 종목은 저마다 숨겨진 규칙을 따릅니다. 처음에는 몇 단어만 보이고, 5라운드, 10라운드, 15라운드, 20라운드에 더 많은 단어가 공개됩니다. |
| `ex.s6` | After every round you see how much of each stock was bought, sold and held. Those numbers are your clues. | Minden kör után kiderül, mennyit vettek, adtak el és tartanak az egyes részvényekből. Ezek a számok a nyomaid. | 매 라운드가 끝나면 각 종목이 얼마나 매수, 매도, 보유되었는지 공개됩니다. 그 숫자들이 바로 단서입니다. |
| `ex.s7` | Once per game, you can hide one stock for two rounds. Nobody sees its price, and nobody knows who hid it. If you hold a hidden stock, even your own cash is hidden. | Játékonként egyszer elrejthetsz egy részvényt két körre. Senki sem látja az árát, és azt sem tudja, ki rejtette el. Ha nálad van egy elrejtett részvény, még a saját készpénzedet sem látod. | 게임당 한 번, 한 종목을 두 라운드 동안 가릴 수 있습니다. 아무도 그 가격을 볼 수 없고, 누가 가렸는지도 모릅니다. 가려진 종목을 갖고 있으면 내 현금조차 보이지 않습니다. |
| `ex.s8` | Until round twenty, a piece buys ten thousand marks in cash, or a private peek at the next hidden words of a rule. | A huszadik kör végéig egy zsetonért tízezer márka készpénzt kapsz, vagy titokban belenézhetsz egy szabály következő rejtett szavaiba. | 20라운드까지 피스 하나로 현금 만 마크를 받거나, 규칙의 다음 가려진 단어를 몰래 엿볼 수 있습니다. |
| `ex.s9` | Done trading? Press Ready. When everyone is ready, the round ends early. | Végeztél a kereskedéssel? Nyomd meg a Kész gombot. Ha mindenki kész, a kör hamarabb véget ér. | 거래를 마쳤나요? 준비를 누르세요. 모두 준비되면 라운드가 일찍 끝납니다. |
| `ex.s10` | After round twenty-four, the player with the highest net worth wins. Watch the market, crack the rules, and trust no one. Good luck! | A huszonnegyedik kör után a legnagyobb nettó vagyonú játékos nyer. Figyeld a piacot, fejtsd meg a szabályokat, és ne bízz senkiben. Sok sikert! | 24라운드가 끝나면 총자산이 가장 많은 플레이어가 승리합니다. 시장을 지켜보고, 규칙을 풀고, 아무도 믿지 마세요. 행운을 빕니다! |
| `ex.frozenChip` | Prices stay fixed until the round ends | Az árak a kör végéig nem változnak | 라운드가 끝날 때까지 가격은 고정됩니다 |
| `how.title` | How to play | Játékszabály | 게임 방법 |
| `how.currency` | Money is counted in Mystery Marks, written {symbol} — a script capital M, for “Mystery”. Say it “mark”: {example} is read “ten thousand marks”. It is a made-up currency; no real money is involved. | A pénznem a Rejtélymárka, jele {symbol} — írott nagy M, a „Mystery” (rejtély) szóból. Kiejtése „márka”: a {example} úgy hangzik, „tízezer márka”. Kitalált pénznem, valódi pénz nincs a játékban. | 화폐는 미스터리 마크이고 {symbol}로 씁니다. ‘미스터리(Mystery)’의 M을 필기체로 쓴 기호입니다. ‘마크’라고 읽으며, {example}는 ‘만 마크’라고 읽습니다. 가상의 화폐이며 실제 돈은 오가지 않습니다. |
| `how.basics` | Seven stocks open at {start}. You start with {cash} and 3 pieces. Prices never go below {floor}. | Hét részvény indul {start} áron. Kezdéskor {cash} készpénzed és 3 zsetonod van. Az árak sosem esnek {floor} alá. | 일곱 종목이 {start}에 시작합니다. 현금 {cash}과 피스 3개를 가지고 시작합니다. 주가는 {floor} 아래로 내려가지 않습니다. |
| `how.rounds` | There are 24 rounds. Trade whole shares at the round's price — prices don't move within a round. When the round ends, every stock settles to a new price at once. | 24 kör van. Csak egész részvényekkel kereskedhetsz, a kör aktuális árán — körön belül az árak nem változnak. A kör végén minden részvény egyszerre kap új árat. | 총 24라운드입니다. 라운드 가격으로 1주 단위로 거래하며, 라운드 중에는 가격이 움직이지 않습니다. 라운드가 끝나면 모든 종목이 한꺼번에 새 가격으로 정산됩니다. |
| `how.rules` | Each stock moves by a hidden rule. A few words are shown at the start; more are revealed at rounds 5, 10, 15 and 20, when every rule is complete. Market-wide volume and holdings are published after each round. | Minden részvényt egy rejtett szabály mozgat. Eleinte csak néhány szó látszik; az 5., 10., 15. és 20. körben újabbak derülnek ki, a 20. körre minden szabály teljes. Minden kör után kiderül, mennyit vettek, adtak el és tartanak összesen az egyes részvényekből. | 각 종목은 숨겨진 규칙에 따라 움직입니다. 처음엔 몇 단어만 보이고 5, 10, 15, 20라운드에 더 공개되며, 20라운드에 모든 규칙이 완성됩니다. 매 라운드 후 시장 전체의 거래량과 보유량이 공개됩니다. |
| `how.secret` | Once per game you may place a secret on one stock: it is hidden from everyone (price, stats and chart) for the next two rounds. Secrets are anonymous. Anyone holding a hidden stock can't see their own cash or net worth. | Játékonként egyszer elrejthetsz egy részvényt: a következő két körben senki sem látja az árát, a forgalmát és a grafikonját. Azt sem tudja meg senki, ki rejtette el. Amíg nálad van egy elrejtett részvény, a saját készpénzedet és nettó vagyonodat sem látod. | 게임당 한 번 한 종목에 비밀을 걸 수 있습니다. 다음 두 라운드 동안 그 종목의 가격·통계·차트가 모두에게 가려집니다. 비밀은 익명입니다. 가려진 종목을 보유한 사람은 자기 현금과 총자산을 볼 수 없습니다. |
| `how.pieces` | Until the end of round 20 a piece buys {piece} in cash, or a private peek at the next hidden words of one rule. | A 20. kör végéig egy zsetonért {piece} készpénzt kapsz, vagy titokban megnézheted egy szabály következő rejtett szavait. | 20라운드가 끝날 때까지 피스 하나로 현금 {piece}을 받거나, 한 규칙의 다음 가려진 단어를 몰래 엿볼 수 있습니다. |
| `how.end` | After round 24 the player with the highest net worth wins. Ties go to the player whose lowest net worth during the game was higher. | A 24. kör után a legnagyobb nettó vagyonú játékos nyer. Holtversenynél az nyer, akinek a játék közbeni legalacsonyabb nettó vagyona magasabb volt. | 24라운드가 끝나면 총자산이 가장 많은 플레이어가 이깁니다. 동점이면 게임 중 최저 자산이 더 높았던 사람이 앞섭니다. |
| `how.bots` | Bots trade at the end of each round, after the humans, so they can react to that round's trades. | A botok minden kör végén, az emberek után kereskednek, így reagálhatnak az adott kör ügyleteire. | 봇은 매 라운드 끝에 사람들보다 나중에 거래하므로, 그 라운드의 거래에 반응할 수 있습니다. |
| `how.credit` | Inspired by “Mystery Stock Market” from The Devil's Plan: Dead Again (season 3). The rules are a fan reconstruction; some words, the logo shape and the 3 starting pieces are our own additions. The currency is the made-up Mystery Mark (ℳ). | Ihlette a The Devil's Plan: Dead Again (3. évad) „Rejtélyes tőzsde” játéka. A szabályok rajongói rekonstrukción alapulnak; néhány szó, a logó formája és a 3 kezdő zseton saját kiegészítés. A pénznem a kitalált Rejtélymárka (ℳ). | 〈데블스 플랜〉 시즌 3의 ‘미스터리 거래소’에서 영감을 받았습니다. 규칙은 팬들의 재구성이며, 일부 문구와 로고 모양, 시작 피스 3개는 저희가 추가한 것입니다. 화폐는 가상의 미스터리 마크(ℳ)입니다. |
| `err.unknown` | Something went wrong ({code}). | Hiba történt ({code}). | 문제가 발생했습니다 ({code}). |
| `err.network` | Can't reach the server. Check your connection. | Nem érhető el a szerver. Ellenőrizd a kapcsolatot. | 서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요. |
| `err.bad_message` | That request was not understood. | Ezt a kérést nem sikerült értelmezni. | 요청을 이해하지 못했습니다. |
| `err.bad_request` | That request was not understood. | Ezt a kérést nem sikerült értelmezni. | 요청을 이해하지 못했습니다. |
| `err.try_again` | Please try again. | Próbáld újra. | 다시 시도해 주세요. |
| `err.hello_first` | Still connecting — try again in a moment. | Még csatlakozunk — próbáld újra egy pillanat múlva. | 아직 연결 중입니다. 잠시 후 다시 시도하세요. |
| `err.not_host` | Only the host can do that. | Ezt csak a házigazda teheti meg. | 호스트만 할 수 있습니다. |
| `err.kicked` | The host removed you from this room. | A házigazda eltávolított ebből a szobából. | 호스트가 이 방에서 내보냈습니다. |
| `err.unknown_token` | Your saved seat was not found in this room. | A mentett helyed nem található ebben a szobában. | 저장된 자리를 이 방에서 찾을 수 없습니다. |
| `err.room_full` | This room is full. | Ez a szoba megtelt. | 방이 가득 찼습니다. |
| `err.game_started` | The game has already started — you're watching. | A játék már elkezdődött — nézőként vagy itt. | 게임이 이미 시작되었습니다. 관전 중입니다. |
| `err.already_joined` | You already joined. | Már csatlakoztál. | 이미 참가했습니다. |
| `err.bad_name` | Names need 1–16 characters and no control characters. | A név 1–16 karakter legyen, vezérlőkarakterek nélkül. | 이름은 1–16자이며 제어 문자를 쓸 수 없습니다. |
| `err.bad_code` | Room codes are five letters or digits. | A szobakód öt betű vagy számjegy. | 방 코드는 영문자 또는 숫자 다섯 자리입니다. |
| `err.name_taken` | Someone in this room already has that name. | Valakinek már ez a neve ebben a szobában. | 이 방에 같은 이름이 이미 있습니다. |
| `err.not_seated` | You don't have a seat in this game. | Nincs helyed ebben a játékban. | 이 게임에 자리가 없습니다. |
| `err.paused` | The game is paused. | A játék szünetel. | 게임이 일시 정지 중입니다. |
| `err.not_paused` | The game isn't paused. | A játék nem szünetel. | 게임이 일시 정지 상태가 아닙니다. |
| `err.not_trading` | Trading is closed right now. | Most nincs kereskedés. | 지금은 거래할 수 없습니다. |
| `err.not_finished` | The game hasn't finished yet. | A játék még nem ért véget. | 게임이 아직 끝나지 않았습니다. |
| `err.lobby_only` | That can only be changed in the lobby. | Ezt csak a váróteremben lehet módosítani. | 대기실에서만 바꿀 수 있습니다. |
| `err.need_players` | You need at least {min} seats to start. | Legalább {min} hely kell az induláshoz. | 시작하려면 최소 {min}석이 필요합니다. |
| `err.too_many_tvs` | This room already has the maximum number of TVs. | Ehhez a szobához már a maximális számú tévé csatlakozik. | 이 방에 연결할 수 있는 TV 수가 가득 찼습니다. |
| `err.pair_not_found` | That TV code wasn't found or has expired. Check the code on the TV. | A tévékód nem található vagy lejárt. Nézd meg a kódot a tévén. | TV 코드를 찾을 수 없거나 만료되었습니다. TV의 코드를 확인하세요. |
| `err.unpaired` | This TV was disconnected by the host. | A házigazda leválasztotta ezt a tévét. | 호스트가 이 TV의 연결을 해제했습니다. |
| `err.room_closed` | This room has closed. | Ez a szoba bezárt. | 방이 닫혔습니다. |
| `err.not_found` | That room doesn't exist (or has closed). | Ez a szoba nem létezik (vagy már bezárt). | 존재하지 않는 방입니다(또는 이미 닫혔습니다). |
| `err.rate_limited` | Too many attempts. Wait a minute and try again. | Túl sok próbálkozás. Várj egy percet, és próbáld újra. | 시도가 너무 많습니다. 1분 뒤에 다시 시도하세요. |
| `err.bad_target` | That player isn't available. | Ez a játékos nem elérhető. | 해당 플레이어를 선택할 수 없습니다. |
| `err.cannot_kick_host` | The host can't be kicked. | A házigazdát nem lehet kirúgni. | 호스트는 내보낼 수 없습니다. |
| `err.game_over` | The game is over. | A játéknak vége. | 게임이 끝났습니다. |
| `err.no_seat` | You don't have a seat in this game. | Nincs helyed ebben a játékban. | 이 게임에 자리가 없습니다. |
| `err.frozen` | Your seat is frozen. | A helyed le van fagyasztva. | 자리가 동결되었습니다. |
| `err.bad_stock` | Unknown stock. | Ismeretlen részvény. | 알 수 없는 종목입니다. |
| `err.bad_qty` | Enter a whole number of shares. | Egész darabszámot adj meg. | 주식 수는 정수로 입력하세요. |
| `err.insufficient_cash` | Not enough cash for that order. | Nincs elég készpénzed ehhez a megbízáshoz. | 주문할 현금이 부족합니다. |
| `err.not_enough_shares` | You don't hold that many shares. | Nincs ennyi részvényed. | 보유한 주식이 부족합니다. |
| `err.secret_used` | You've already used your secret. | Ebben a játékban már elrejtettél egy részvényt. | 비밀을 이미 사용했습니다. |
| `err.pieces_closed` | Pieces can no longer be used. | A zsetonok már nem használhatók. | 이제 피스를 쓸 수 없습니다. |
| `err.no_pieces` | You have no pieces left. | Nincs több zsetonod. | 남은 피스가 없습니다. |
| `err.rule_fully_visible` | That rule is already fully visible — your piece was kept. | Ez a szabály már teljesen látható — a zsetonod megmaradt. | 이미 모두 공개된 규칙입니다. 피스는 그대로 남았습니다. |
| `toast.unknown` | {code} | {code} | {code} |
| `toast.trade_ok` | {side} {qty} × {stock} | {side} {qty} db {stock} | {stock} {qty}주 {side} |
| `toast.secret_placed` | Secret placed on {stock}. | Elrejtetted: {stock}. | {stock}에 비밀을 걸었습니다. |
| `toast.piece_cash` | Piece cashed in. | Zseton beváltva. | 피스를 현금화했습니다. |
| `toast.piece_peek` | Peeked at {stock}'s rule. | Bepillantottál ennek a szabályába: {stock}. | {stock}의 규칙을 엿봤습니다. |
| `toast.tv_paired` | TV connected. | Tévé csatlakoztatva. | TV가 연결되었습니다. |
| `ev.unknown` | {code} | {code} | {code} |
| `ev.ev_joined` | {name} joined. | {name} csatlakozott. | {name} 님이 참가했습니다. |
| `ev.ev_left_kicked` | {name} was removed by the host. | A házigazda eltávolította: {name}. | 호스트가 {name} 님을 내보냈습니다. |
| `ev.ev_bot_added` | A bot joined. | Egy bot csatlakozott. | 봇이 참가했습니다. |
| `ev.ev_started` | The game started with {seats} seats. | A játék {seats} hellyel elindult. | {seats}석으로 게임이 시작되었습니다. |
| `ev.ev_settled` | Round {round} settled. | Elszámolva: {round}. kör. | {round}라운드가 정산되었습니다. |
| `ev.ev_reveal` | Round {round}: more of every rule is revealed. | {round}. kör: minden szabályból újabb részlet derült ki. | {round}라운드: 모든 규칙이 조금 더 공개되었습니다. |
| `ev.ev_hidden` | {stock} is hidden by a secret. | Valaki elrejtette: {stock}. | 비밀로 가려진 종목: {stock} |
| `ev.ev_paused` | The host paused the game. | A házigazda szüneteltette a játékot. | 호스트가 게임을 일시 정지했습니다. |
| `ev.ev_resumed` | The game resumed. | A játék folytatódik. | 게임이 재개되었습니다. |
| `ev.ev_host_changed` | {name} is now the host. | Mostantól {name} a házigazda. | 이제 {name} 님이 호스트입니다. |
| `ev.ev_finished` | The game is over. | Vége a játéknak. | 게임이 끝났습니다. |

## Rule templates

Tokens are shown as `[group] text`. `{a}` / `{theA}` / `{aSubj}` = another company, `{x}` `{y}` `{p}` = amounts, `{l}` `{h}` `{k}` = counts.

### `cmpBuy`

- **en**: [0] If · [1] this stock's buy volume · [2] beats {a}'s · [0] this round: · [3] +{x}. · [0] Otherwise: · [4] −{y}.
- **hu**: [0] Ha · [1] ennek a részvénynek a vételi volumene · [0] ebben a körben · [2] meghaladja {theA} vételi volumenét: · [3] +{x}. · [0] Különben: · [4] −{y}.
- **ko**: [0] 이번 라운드에 · [1] 이 종목의 매수량이 · [2] {a}의 매수량보다 많으면: · [3] +{x}. · [0] 아니면: · [4] −{y}.

### `band`

- **en**: [0] If · [1] total holdings of this stock · [0] end the round · [2] between {l} and {h} shares: · [3] +{x}. · [0] Otherwise: · [4] −{y}.
- **hu**: [0] Ha · [1] ennek a részvénynek az összes állománya · [0] a kör végén · [2] {l} és {h} darab között van: · [3] +{x}. · [0] Különben: · [4] −{y}.
- **ko**: [0] 라운드 종료 시 · [1] 이 종목의 총 보유량이 · [2] {l}~{h}주 사이이면: · [3] +{x}. · [0] 아니면: · [4] −{y}.

### `perShare`

- **en**: [0] For every share that · [1] total holdings · [2] rise · [0] this round: · [3] −{p}. · [0] For every share they · [2] fall: · [4] +{p}.
- **hu**: [0] Minden darab után, amennyivel · [1] az összes állomány · [0] ebben a körben · [2] nő: · [3] −{p}. · [0] Minden darab után, amennyivel · [2] csökken: · [4] +{p}.
- **ko**: [0] 이번 라운드에 · [1] 총 보유량이 · [0] 1주 · [2] 늘 때마다: · [3] −{p}. · [0] 1주 · [2] 줄 때마다: · [4] +{p}.

### `follow`

- **en**: [0] If · [2] {a} · [1] rises in the same settlement: · [3] +{x}. · [0] Otherwise: · [4] −{y}.
- **hu**: [0] Ha · [2] {theA} · [1] ugyanabban az elszámolásban emelkedik: · [3] +{x}. · [0] Különben: · [4] −{y}.
- **ko**: [0] 같은 정산에서 · [2] {aSubj} · [1] 오르면: · [3] +{x}. · [0] 아니면: · [4] −{y}.

### `breadth`

- **en**: [0] If · [2] {k} or more · [1] stocks rose in the previous settlement: · [3] +{x}. · [0] If · [2] {k} or more · [1] fell: · [4] −{y}. · [0] Otherwise: no change.
- **hu**: [0] Ha az előző elszámolásban · [2] legalább {k} · [1] részvény emelkedett: · [3] +{x}. · [0] Ha · [2] legalább {k} · [1] esett: · [4] −{y}. · [0] Különben nincs változás.
- **ko**: [0] 직전 정산에서 · [2] {k}개 이상의 · [1] 종목이 올랐으면: · [3] +{x}. · [2] {k}개 이상이 · [1] 내렸으면: · [4] −{y}. · [0] 그 외에는 변동 없음.

### `secret`

- **en**: [0] If · [2] {a} · [1] will be hidden by a secret next round: · [3] +{x}. · [0] Otherwise: · [4] −{y}.
- **hu**: [0] Ha · [2] {theA} · [1] a következő körben el lesz rejtve: · [3] +{x}. · [0] Különben: · [4] −{y}.
- **ko**: [0] 다음 라운드에 · [2] {aSubj} · [1] 비밀로 가려지면: · [3] +{x}. · [0] 아니면: · [4] −{y}.

### `logo`

- **en**: [0] The price · [1] follows a fixed path · [2] that is drawn · [3] on every screen: · [4] it is the game's logo.
- **hu**: [0] Az árfolyam · [1] rögzített pályát követ, · [2] amely ki van rajzolva · [3] minden képernyőn: · [4] ez a játék logója.
- **ko**: [0] 주가는 · [1] 정해진 경로를 따른다. · [2] 그 경로는 · [3] 모든 화면에 그려져 있다: · [4] 바로 게임 로고다.

### `sellBuy`

- **en**: [0] If · [1] this stock's sell volume · [2] beats its buy volume · [0] this round: · [3] +{x}. · [0] Otherwise: · [4] −{y}.
- **hu**: [0] Ha · [1] ennek a részvénynek az eladási volumene · [0] ebben a körben · [2] meghaladja a saját vételi volumenét: · [3] +{x}. · [0] Különben: · [4] −{y}.
- **ko**: [0] 이번 라운드에 · [1] 이 종목의 매도량이 · [2] 자신의 매수량보다 많으면: · [3] +{x}. · [0] 아니면: · [4] −{y}.

### `cheapest`

- **en**: [0] If · [1] this stock's price · [2] is the lowest on the board (ties count) · [0] before settlement: · [3] +{x}. · [0] Otherwise: · [4] −{y}.
- **hu**: [0] Ha · [1] ennek a részvénynek az ára · [0] elszámolás előtt · [2] a legalacsonyabb a táblán (holtverseny is számít): · [3] +{x}. · [0] Különben: · [4] −{y}.
- **ko**: [0] 정산 전 · [1] 이 종목의 주가가 · [2] 보드에서 가장 낮으면(동률 포함): · [3] +{x}. · [0] 아니면: · [4] −{y}.

### `holdRank`

- **en**: [0] If · [1] this stock's total holdings · [2] are the highest on the board (ties count) · [0] at the end of the round: · [3] −{x}. · [0] Otherwise: · [4] +{y}.
- **hu**: [0] Ha · [1] ennek a részvénynek az összes állománya · [0] a kör végén · [2] a legnagyobb a táblán (holtverseny is számít): · [3] −{x}. · [0] Különben: · [4] +{y}.
- **ko**: [0] 라운드 종료 시 · [1] 이 종목의 총 보유량이 · [2] 보드에서 가장 많으면(동률 포함): · [3] −{x}. · [0] 아니면: · [4] +{y}.

---
Regenerate: `npx vitest run --config vitest.config.ts test/engine/i18n-report.test.ts` with `I18N_REPORT=1`.
