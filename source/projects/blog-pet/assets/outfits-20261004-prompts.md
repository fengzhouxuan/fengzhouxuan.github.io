# 柚柚新增衣橱素材提示词

使用内置 imagegen，透明背景。2026-10-04 新增四套衣服，原有脸型、发型、比例与画风保持不变。

## v1 姿势图集

参考 / edit target：`youyou-girl-v1.png`。每套最终提示词为以下模板加上该套服装的 Outfit 描述。

```text
Use case: identity-preserve. Asset type: transparent 2 by 2 game character sprite atlas. Use the reference as the edit target. Preserve Youyou's exact identity: chestnut brown short bob and bangs, amber-brown eyes, round face, pink cheeks, tiny nose, orange fruit hair clip, two-and-a-half-head chibi proportions, delicate warm watercolor/digital illustration style, line weight and material shading. Only replace clothes and add the small matching clothing details specified. Single same character, full body, centered in every cell, consistent size, transparent empty margins, no cropped head or feet. Real transparent RGBA background, no floor, shadows, background decoration, borders, labels, text, watermark or extra characters. EXACTLY four equally-sized cells in a 2 columns x 2 rows grid, each subject fits fully inside its cell. TOP LEFT: calm standing, open eyes, hands together in front. TOP RIGHT: happy closed-eye smile, hands beside cheeks. BOTTOM LEFT: smiling closed eyes and holding a small round butter cookie at the mouth with both hands. BOTTOM RIGHT: sitting curled gently on the ground, head resting on folded hands, closed eyes sleeping; same outfit. Keep silhouette recognizably the same as reference and make the clothing details visible at small scale.
```

## v2 连续动作图集

Image 1：该套新服装的 v1 PNG（服装与身份参考）。Image 2：`youyou-sage-motion-v2.png`（32 帧动作布局参考）。每套最终提示词为以下模板加上该套服装的 Costume 描述。

```text
Use case: identity-preserve. Asset type: transparent animated game character sprite atlas. Image 1 is the costume and identity reference; Image 2 is the animation layout and pose guide. Recreate Image 2's EXACT 8 columns by 4 rows, 32 full-body frames in a 2:1 landscape canvas, but EVERY frame wears the complete outfit from Image 1. Preserve the exact same face, chestnut short bob, amber eyes, orange hair clip, tiny chibi proportions and delicate warm illustration style. Match Image 1's garment cut, collar, decorations, colors, shoes and sleeve length in ALL frames, including eating and stretching. Consistent head size, overall standing height and centered feet; no scale drift or overlapping neighboring cells. Transparent gutters between every cell; transparent RGBA background with no floor, shadows, opaque backdrop, grid lines, borders, text, captions or watermark. Row 1: quiet standing with hands in front, frame 4 (column 4) is a closed-eye gentle blink, other seven open-eyed. Row 2: an 8-frame gentle reaction to being patted: standing, slight smile, hands rising, hands by cheeks, joyful closed-eye smile, hands lowering, return toward standing, exact starting standing pose. Row 3: an 8-frame cookie eating: standing, cookie held low, cookie rises, cookie at mouth, tiny bite and happy closed eyes, chewing, cookie lowers, exact starting standing pose. Row 4: an 8-frame slow stretch: standing, hands start to lift, elbows rise, hands stretch beside head, eyes closed gentle yawn with arms raised, elbows lower, hands lower, exact starting standing pose. Long sleeves and skirt should follow the hands naturally. All 32 cels fully visible, hair and hands never cropped. Elegant small readable details, no extra people or props except the little round cookie in the eating row.
```

## 四套服装描述

### 月白汉服 / moon

```text
Elegant Chinese hanfu in moon-white and pale mist blue: crossed ivory collar, pale blue waist sash, flowing full-length pleated skirt, small pearl blossom hair ornament beside the existing orange clip, embroidered tiny silver leaves, soft cloth shoes. Airy graceful silhouette, sleeves never hide the face or swallow the hands.
```

### 桃花襦裙 / peach

```text
Chinese spring ruqun hanfu: peach-pink upper garment and cream high-waist flowing pleated skirt, soft rose ribbon sash, subtle peach blossom embroidery at the hem, a tiny blossom ornament beside the orange clip, cream cloth shoes. Sweet warm silhouette, long sleeves with visible tiny hands.
```

### 樱桃学院 / cherry

```text
Cozy academy outfit: cranberry-red knitted vest over an ivory long-sleeve blouse, small cream bow at the collar, navy pleated skirt, ivory knee socks and brown Mary Jane shoes. Tiny cherry embroidery on the vest. No hat, no book and no bag, keep hands available for gestures.
```

### 软绵睡衣 / cloud

```text
Soft cozy pajama set: powder-blue loose button-up long-sleeve top with an ivory collar and tiny pale yellow star motifs, matching loose pajama pants, blush pink fluffy slippers. A little soft cream ribbon beside the orange hair clip. No sleep mask, no pillow or blanket, eyes visible, rounded gentle silhouette.
```

## 输出与编译

PNG 原稿保存在本目录。通过 `node scripts/build-blog-pet-outfits.cjs` 编码 WebP，并从新动作图集的闭眼帧编译四格眨眼图集。编码不改变角色设计，保留透明背景。
