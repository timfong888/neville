import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("runTriage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    process.env.GITHUB_TOKEN = "ghp_testtoken";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.GITHUB_TOKEN;
  });

  function listIssuesResponse(issues: Array<{ title: string; html_url: string; number: number }>) {
    return new Response(JSON.stringify(issues), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  function createIssueResponse(number: number) {
    return new Response(
      JSON.stringify({ html_url: `https://github.com/timfong888/neville/issues/${number}`, number }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  }

  it("creates a GitHub issue for each new reason", async () => {
    fetchMock
      .mockResolvedValueOnce(listIssuesResponse([])) // no existing issues
      .mockResolvedValueOnce(createIssueResponse(300)); // new issue created

    const { runTriage } = await import("@/lib/server/triage");
    const summary = { "voice_failed:http_status": { count: 3, sampleIds: ["req_1", "req_2"] } };
    const result = await runTriage(summary, "2026-11-27");

    expect(result.created).toHaveLength(1);
    expect(result.created[0].reason).toBe("voice_failed:http_status");
    expect(result.created[0].issueNumber).toBe(300);
    expect(result.skipped).toHaveLength(0);
  });

  it("skips reasons that already have an open auto-triage issue", async () => {
    fetchMock.mockResolvedValueOnce(
      listIssuesResponse([
        {
          title: "[auto-triage] voice_failed:http_status (3 failures on 2026-11-26)",
          html_url: "https://github.com/timfong888/neville/issues/290",
          number: 290,
        },
      ]),
    );

    const { runTriage } = await import("@/lib/server/triage");
    const summary = { "voice_failed:http_status": { count: 1, sampleIds: [] } };
    const result = await runTriage(summary, "2026-11-27");

    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("voice_failed:http_status");
    // Did not call create endpoint
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("creates issues only for new reasons, skips existing ones", async () => {
    fetchMock
      .mockResolvedValueOnce(
        listIssuesResponse([
          {
            title: "[auto-triage] voice_failed:http_status (2 failures on 2026-11-26)",
            html_url: "https://github.com/timfong888/neville/issues/290",
            number: 290,
          },
        ]),
      )
      .mockResolvedValueOnce(createIssueResponse(301)); // new issue for script_failed:timeout

    const { runTriage } = await import("@/lib/server/triage");
    const summary = {
      "voice_failed:http_status": { count: 1, sampleIds: [] },
      "script_failed:timeout": { count: 2, sampleIds: ["req_x"] },
    };
    const result = await runTriage(summary, "2026-11-27");

    expect(result.created).toHaveLength(1);
    expect(result.created[0].reason).toBe("script_failed:timeout");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].reason).toBe("voice_failed:http_status");
  });

  it("throws when GITHUB_TOKEN is not set", async () => {
    delete process.env.GITHUB_TOKEN;
    vi.resetModules();
    const { runTriage } = await import("@/lib/server/triage");
    await expect(
      runTriage({ "voice_failed:timeout": { count: 1, sampleIds: [] } }, "2026-11-27"),
    ).rejects.toThrow("GITHUB_TOKEN not set");
  });

  it("issue title includes reason and count", async () => {
    fetchMock
      .mockResolvedValueOnce(listIssuesResponse([]))
      .mockResolvedValueOnce(createIssueResponse(302));

    const { runTriage } = await import("@/lib/server/triage");
    await runTriage({ "manifest_timeout:timeout": { count: 5, sampleIds: ["id_1"] } }, "2026-11-27");

    const createCall = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(createCall[0]).toContain("/issues");
    const body = JSON.parse(createCall[1].body as string) as Record<string, unknown>;
    expect(body.title as string).toMatch(/\[auto-triage\]/);
    expect(body.title as string).toMatch(/manifest_timeout:timeout/);
    expect(body.title as string).toMatch(/5 failures/);
    expect((body.labels as string[])).toContain("auto-triage");
  });

  it("issue body includes sample request IDs, never wish or script text", async () => {
    fetchMock
      .mockResolvedValueOnce(listIssuesResponse([]))
      .mockResolvedValueOnce(createIssueResponse(303));

    const { runTriage } = await import("@/lib/server/triage");
    await runTriage(
      { "script_failed:exception": { count: 2, sampleIds: ["req_abc", "req_def"] } },
      "2026-11-27",
    );

    const createCall = fetchMock.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(createCall[1].body as string) as Record<string, unknown>;
    const issueBody = body.body as string;
    expect(issueBody).toContain("req_abc");
    expect(issueBody).toContain("req_def");
    for (const forbidden of ["wish", "want", "script text", "name", "email"]) {
      expect(issueBody.toLowerCase()).not.toContain(forbidden);
    }
  });

  // Regression test for P1 pagination: a reason on page 2 must not cause a duplicate issue.
  // Without pagination, page 2 is never fetched and the reason appears new, creating a duplicate.
  it("follows Link pagination and skips reasons found on subsequent pages", async () => {
    // Page 1 has one issue; Link header points to page 2
    const page1 = new Response(
      JSON.stringify([
        {
          title: "[auto-triage] voice_failed:http_status (2 failures on 2026-11-26)",
          html_url: "https://github.com/timfong888/neville/issues/290",
          number: 290,
        },
      ]),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          link: '<https://api.github.com/repos/timfong888/neville/issues?page=2>; rel="next"',
        },
      },
    );
    // Page 2 has the reason we're about to triage
    const page2 = listIssuesResponse([
      {
        title: "[auto-triage] script_failed:timeout (1 failure on 2026-11-25)",
        html_url: "https://github.com/timfong888/neville/issues/291",
        number: 291,
      },
    ]);

    fetchMock.mockResolvedValueOnce(page1).mockResolvedValueOnce(page2);
    // If pagination is broken, it would try to create an issue here (3rd call); this mock throws if called
    fetchMock.mockRejectedValueOnce(new Error("unexpected create call — pagination not followed"));

    const { runTriage } = await import("@/lib/server/triage");
    const summary = {
      "voice_failed:http_status": { count: 1, sampleIds: [] },
      "script_failed:timeout": { count: 2, sampleIds: ["req_z"] },
    };
    const result = await runTriage(summary, "2026-11-27");

    // Both reasons found across two pages → no new issues created
    expect(result.created).toHaveLength(0);
    expect(result.skipped).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(2); // page1 + page2, no create call
  });
});
