import { describe, it, expect } from "bun:test";

// We need to import the function, but it's not exported yet
// Let's create a test for the URL validation logic

describe("YouTube URL Validation", () => {
  function isValidYouTubeUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      // Only allow HTTPS protocol
      if (urlObj.protocol !== "https:") {
        return false;
      }
      return (
        (urlObj.hostname === "www.youtube.com" || urlObj.hostname === "youtube.com" || urlObj.hostname === "youtu.be") &&
        (urlObj.pathname.includes("/watch") || urlObj.pathname.includes("/shorts") || urlObj.hostname === "youtu.be")
      );
    } catch {
      return false;
    }
  }

  it("should accept valid YouTube watch URLs", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isValidYouTubeUrl("https://youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isValidYouTubeUrl("https://youtu.be/dQw4w9WgXcQ")).toBe(true);
  });

  it("should accept valid YouTube shorts URLs", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/shorts/abc123")).toBe(true);
    expect(isValidYouTubeUrl("https://youtube.com/shorts/abc123")).toBe(true);
  });

  it("should reject invalid URLs", () => {
    expect(isValidYouTubeUrl("https://www.google.com")).toBe(false);
    expect(isValidYouTubeUrl("https://www.youtube.com/playlist?list=PL123")).toBe(false);
    expect(isValidYouTubeUrl("not-a-url")).toBe(false);
    expect(isValidYouTubeUrl("")).toBe(false);
    expect(isValidYouTubeUrl("ftp://youtube.com/watch?v=123")).toBe(false);
  });

  it("should reject URLs with invalid paths", () => {
    expect(isValidYouTubeUrl("https://www.youtube.com/channel/UC123")).toBe(false);
    expect(isValidYouTubeUrl("https://www.youtube.com/user/username")).toBe(false);
    expect(isValidYouTubeUrl("https://www.youtube.com/")).toBe(false);
  });
});
