package gg.apex.hud;

import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;

import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.screen.multiplayer.MultiplayerScreen;
import net.minecraft.client.gui.screen.option.OptionsScreen;
import net.minecraft.client.gui.screen.world.SelectWorldScreen;
import net.minecraft.text.Text;
import net.minecraft.util.Identifier;
import java.util.ArrayList;
import java.util.List;

/** Apex main menu: logo, Singleplayer, Multiplayer, Options, Quit and the player's in-game name. */
public class ApexTitleScreen extends Screen {
  private static final Identifier LOGO = new Identifier("apexhud", "textures/gui/logo.png");
  private record Btn(int x, int y, int w, int h, String label, boolean primary, Runnable run) {
    boolean hit(double mx, double my) { return mx >= x && mx < x + w && my >= y && my < y + h; }
  }
  private final List<Btn> btns = new ArrayList<>();
  private int logoY, logoSz;

  public ApexTitleScreen() { super(Text.literal("Apex Client")); }

  @Override protected void init() {
    btns.clear();
    MinecraftClient mc = MinecraftClient.getInstance();
    int bw = 200, bh = 24, gap = 6, cx = width / 2;
    logoSz = Math.min(150, height / 3);
    int total = logoSz + 16 + bh * 3 + gap * 2, top = Math.max(20, (height - total) / 2);
    logoY = top;
    int by = top + logoSz + 16, half = (bw - gap) / 2, x0 = cx - bw / 2;
    btns.add(new Btn(x0, by, bw, bh, "Singleplayer", true, () -> mc.setScreen(new SelectWorldScreen(this))));
    btns.add(new Btn(x0, by + bh + gap, bw, bh, "Multiplayer", false, () -> mc.setScreen(new MultiplayerScreen(this))));
    btns.add(new Btn(x0, by + 2 * (bh + gap), half, bh, "Options", false, () -> mc.setScreen(new OptionsScreen(this, mc.options))));
    btns.add(new Btn(x0 + half + gap, by + 2 * (bh + gap), half, bh, "Quit", false, mc::scheduleStop));
  }

  @Override public boolean shouldCloseOnEsc() { return false; }

  private boolean click(double mx, double my, int button) {
    if (button != 0) return false;
    for (Btn b : btns) if (b.hit(mx, my)) { b.run().run(); return true; }
    return false;
  }
  @Override public boolean mouseClicked(double mx, double my, int button) { return click(mx, my, button); }

  @Override public void render(DrawContext g, int mx, int my, float delta) {
    var tr = MinecraftClient.getInstance().textRenderer;
    g.fillGradient(0, 0, width, height, 0xFF0A1226, 0xFF04060D);
    int lx = width / 2 - logoSz / 2, ly = logoY, sz = logoSz;
    g.drawTexture(LOGO, lx, ly, sz, sz, 0f, 0f, 512, 512, 512, 512);
    for (Btn b : btns) {
      boolean h = b.hit(mx, my);
      g.fill(b.x, b.y, b.x + b.w, b.y + b.h, b.primary ? (h ? 0xFF4A94FF : 0xFF1E7BFF) : (h ? 0xFF1A2440 : 0xFF101626));
      if (!b.primary) { int c = 0xFF1F2A44;
        g.fill(b.x, b.y, b.x + b.w, b.y + 1, c); g.fill(b.x, b.y + b.h - 1, b.x + b.w, b.y + b.h, c);
        g.fill(b.x, b.y, b.x + 1, b.y + b.h, c); g.fill(b.x + b.w - 1, b.y, b.x + b.w, b.y + b.h, c); }
      g.drawText(tr, b.label, b.x + (b.w - tr.getWidth(b.label)) / 2, b.y + (b.h - 8) / 2, 0xFFFFFFFF, true);
    }
    // account chip: shows the real in-game name of whoever is signed in
    String name = MinecraftClient.getInstance().getSession().getUsername();
    int cw = tr.getWidth(name) + 30;
    g.fill(12, 12, 12 + cw, 34, 0xE0101626);
    g.fill(20, 20, 26, 26, 0xFF1E7BFF);
    g.drawText(tr, name, 32, 19, 0xFFFFFFFF, true);
    g.drawText(tr, "Apex Client 1.0.0 (Minecraft 1.20.1)", 8, height - 14, 0xFF7C8AA8, false);
    String legal = "Not affiliated with Mojang or Microsoft.";
    g.drawText(tr, legal, width - tr.getWidth(legal) - 8, height - 14, 0xFF7C8AA8, false);
  }
}
