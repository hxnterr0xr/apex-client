package gg.apex.hud;

import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.minecraft.client.gui.screen.TitleScreen;
import net.fabricmc.fabric.api.client.keybinding.v1.KeyBindingHelper;
import net.fabricmc.fabric.api.client.rendering.v1.hud.HudElementRegistry;
import net.fabricmc.fabric.api.client.rendering.v1.hud.VanillaHudElements;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.option.KeyBinding;
import net.minecraft.client.util.InputUtil;
import net.minecraft.util.Identifier;
import org.lwjgl.glfw.GLFW;
import java.util.ArrayDeque;

/** Apex HUD for 1.21.11: FPS, CPS, coordinates, WASD keys. Right Shift shows/hides it. */
public class ApexHud implements ClientModInitializer {
  private static KeyBinding toggle;
  private static boolean show = true;
  private final ArrayDeque<Long> left = new ArrayDeque<>(), right = new ArrayDeque<>();
  private boolean wasL, wasR;

  @Override public void onInitializeClient() {
    // swap the vanilla main menu for the Apex one
    ClientTickEvents.END_CLIENT_TICK.register(mc -> { if (mc.currentScreen instanceof TitleScreen) mc.setScreen(new ApexTitleScreen()); });
    toggle = KeyBindingHelper.registerKeyBinding(new KeyBinding("key.apexhud.toggle", InputUtil.Type.KEYSYM,
        GLFW.GLFW_KEY_RIGHT_SHIFT, KeyBinding.Category.create(Identifier.of("apexhud", "main"))));
    HudElementRegistry.attachElementBefore(VanillaHudElements.CHAT, Identifier.of("apexhud", "hud"),
        (ctx, tick) -> render(ctx));
  }

  private int cps(ArrayDeque<Long> q, long now) { while (!q.isEmpty() && now - q.peekFirst() > 1000) q.pollFirst(); return q.size(); }

  private void render(DrawContext g) {
    MinecraftClient mc = MinecraftClient.getInstance();
    while (toggle.wasPressed()) show = !show;
    if (!show || mc.player == null || mc.options.hudHidden) return;
    long now = System.currentTimeMillis(); long w = mc.getWindow().getHandle();
    boolean l = GLFW.glfwGetMouseButton(w, 0) == 1, r = GLFW.glfwGetMouseButton(w, 1) == 1;
    if (l && !wasL) left.add(now); if (r && !wasR) right.add(now); wasL = l; wasR = r;

    var tr = mc.textRenderer;
    g.drawText(tr, "FPS " + mc.getCurrentFps(), 6, 6, 0xFF4DA3FF, true);
    g.drawText(tr, "CPS " + cps(left, now) + " | " + cps(right, now), 6, 18, 0xFFFFFFFF, true);
    var p = mc.player.getBlockPos();
    g.drawText(tr, "XYZ " + p.getX() + " " + p.getY() + " " + p.getZ(), 6, 30, 0xFFFFFFFF, true);

    int bx = 6, by = 48, s = 20, gap = 2;
    key(g, "W", bx + s + gap, by, s, mc.options.forwardKey.isPressed());
    key(g, "A", bx, by + s + gap, s, mc.options.leftKey.isPressed());
    key(g, "S", bx + s + gap, by + s + gap, s, mc.options.backKey.isPressed());
    key(g, "D", bx + 2 * (s + gap), by + s + gap, s, mc.options.rightKey.isPressed());
  }

  private void key(DrawContext g, String t, int x, int y, int s, boolean on) {
    g.fill(x, y, x + s, y + s, on ? 0xCC1E7BFF : 0x88000000);
    var tr = MinecraftClient.getInstance().textRenderer;
    g.drawText(tr, t, x + (s - tr.getWidth(t)) / 2, y + 6, 0xFFFFFFFF, false);
  }
}
