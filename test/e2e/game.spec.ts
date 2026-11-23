import { expect, test, type Browser, type Page } from "@playwright/test";

interface Client {
  page: Page;
  frames: string[];
}

async function client(browser: Browser, viewport = { width: 390, height: 844 }): Promise<Client> {
  const ctx = await browser.newContext({ locale: "en-US", viewport });
  const page = await ctx.newPage();
  const frames: string[] = [];
  page.on("websocket", (ws) => {
    ws.on("framereceived", (f) => {
      if (typeof f.payload === "string") frames.push(f.payload);
    });
  });
  return { page, frames };
}

const creds = (c: Client, code: string) =>
  c.page.evaluate((k) => JSON.parse(localStorage.getItem(`msm:room:${k}`) ?? "{}"), code) as Promise<{
    token?: string;
    hostToken?: string;
    displayToken?: string;
  }>;

function views(frames: string[]) {
  return frames
    .map((f) => {
      try {
        return JSON.parse(f);
      } catch {
        return null;
      }
    })
    .filter((m) => m && m.type === "view")
    .map((m) => m.view);
}

test("host, two players and a TV play a game; no hidden info in any frame", async ({ browser }) => {
  const host = await client(browser);
  const p1 = await client(browser);
  const p2 = await client(browser);
  const tv = await client(browser, { width: 1280, height: 720 });

  // Host creates a room.
  await host.page.goto("/");
  await host.page.getByPlaceholder("1–16 characters").fill("Hosty");
  await host.page.getByRole("button", { name: "Create room" }).click();
  await host.page.waitForURL(/\/r\/[A-HJ-NP-Z2-9]{5}$/);
  const code = host.page.url().split("/").pop()!;
  // Entering the lobby shows the rules; "I understand" is the only way out.
  await host.page.keyboard.press("Escape");
  await host.page.getByRole("button", { name: "I understand" }).click();
  await expect(host.page.getByRole("button", { name: "I understand" })).toHaveCount(0);

  // Two players join through the QR link.
  for (const [c, name] of [
    [p1, "Pia"],
    [p2, "Pál"],
  ] as const) {
    await c.page.goto(`/j/${code}`);
    await c.page.getByPlaceholder("1–16 characters").fill(name);
    await c.page.getByRole("button", { name: "Join the game" }).click();
    await c.page.getByRole("button", { name: "I understand" }).click();
    await expect(c.page.getByText("Waiting for the host to start…")).toBeVisible();
  }

  // TV pairs by code.
  await tv.page.goto("/tv");
  await expect(tv.page.locator(".tv-code")).toHaveText(/^\d{3} \d{3}$/);
  const pairCode = (await tv.page.locator(".tv-code").innerText()).trim();
  await host.page.getByLabel("Pairing code").fill(pairCode);
  await host.page.getByRole("button", { name: "Connect a TV" }).click();
  await expect(tv.page.locator(".tv-room-code")).toHaveText(code);
  await expect(tv.page.getByText("Pál")).toBeVisible();

  // Start.
  await host.page.getByRole("button", { name: "Start game" }).click();
  for (const c of [host, p1, p2]) await expect(c.page.locator(".gamebar")).toBeVisible({ timeout: 15_000 });
  await expect(tv.page.getByText("01/24")).toBeVisible();

  // P1 buys 2 Open Security.
  await p1.page.getByRole("button", { name: /Open Security/ }).click();
  await p1.page.getByLabel("Quantity").fill("2");
  await p1.page.getByRole("button", { name: "Buy", exact: true }).click();
  await expect(p1.page.getByText("Your shares: 2")).toBeVisible();

  // P2 places a secret on Latter Electronics.
  await p2.page.getByRole("button", { name: "Place secret" }).click();
  await p2.page.getByRole("dialog").getByRole("button", { name: "Latter Electronics" }).click();
  await p2.page.getByRole("dialog").getByRole("button", { name: "Place secret" }).click();
  await expect(p2.page.getByText("Latter Electronics, round 1")).toBeVisible();

  // Refreshing a phone mid-game resumes the same seat.
  await p1.page.reload();
  await expect(p1.page.getByText("Your shares: 2")).toBeVisible();

  // Host ends the round; Latter is hidden for everyone.
  await host.page.getByRole("button", { name: "Host", exact: true }).click();
  await host.page.getByRole("button", { name: "End round now" }).click();
  await host.page.keyboard.press("Escape");
  await expect(tv.page.getByText("02/24")).toBeVisible();
  await expect(tv.page.locator(".tvb-card").nth(2).locator(".price")).toHaveText("???");
  await expect(p1.page.getByText("A secret is active")).toBeVisible();

  // Host ends the game.
  await host.page.getByRole("button", { name: "Host", exact: true }).click();
  await host.page.getByRole("button", { name: "End game" }).click();
  await host.page.getByRole("button", { name: "Yes, end the game" }).click();
  for (const c of [host, p1, p2, tv]) await expect(c.page.getByText("Final standings")).toBeVisible();

  // ---------------------------------------------------------- frame inspection
  const hostCreds = await creds(host, code);
  const p1Creds = await creds(p1, code);
  const p2Creds = await creds(p2, code);
  const tvCreds = await creds(tv, code);
  expect(hostCreds.hostToken).toMatch(/^[0-9a-f]{32}$/);
  expect(p1Creds.token).toMatch(/^[0-9a-f]{32}$/);
  expect(tvCreds.displayToken).toMatch(/^[0-9a-f]{32}$/);

  const secrets = {
    hostToken: hostCreds.hostToken!,
    hostPlayer: hostCreds.token!,
    p1: p1Creds.token!,
    p2: p2Creds.token!,
    tv: tvCreds.displayToken!,
  };
  const own: Record<string, string[]> = {
    host: [],
    p1: [secrets.p1],
    p2: [secrets.p2],
    tv: [secrets.tv], // delivered to the TV by the pairing socket
  };
  const all = { host, p1, p2, tv };
  const finalView = views(host.frames).at(-1);
  const seed: string = finalView.results.seed;
  expect(seed.length).toBeGreaterThan(3);

  for (const [who, c] of Object.entries(all)) {
    // No token belonging to someone else (and never the host token) in any frame.
    for (const [name, tok] of Object.entries(secrets)) {
      if (own[who]!.includes(tok)) continue;
      for (const f of c.frames) expect(f.includes(tok), `${who} saw ${name}`).toBe(false);
    }
    const vs = views(c.frames);
    expect(vs.length).toBeGreaterThan(0);
    for (const v of vs) {
      if (v.phase !== "finished") {
        // Seed and full rules stay secret until the end.
        expect(JSON.stringify(v).includes(seed), `${who} saw the seed`).toBe(false);
        for (const s of v.stocks) {
          if (s.hidden) {
            expect(s.price).toBeNull();
            expect(s.delta).toBeNull();
            expect(s.last).toBeNull();
            expect(s.chart.at(-1)).toBeNull();
          }
          for (const tok of s.rule) if (tok.g > s.level) expect("text" in tok).toBe(false);
        }
        if (v.anySecret) for (const row of v.standings) expect(row.net).toBeNull();
      }
      // Only P2 may ever learn who placed the secret.
      if (who !== "p2" && v.me) expect(v.me.secretStock).toBeNull();
      if (who === "tv") expect(v.me).toBeNull();
    }
  }
});
