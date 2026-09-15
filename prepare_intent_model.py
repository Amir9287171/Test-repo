"""
اسکریپت آماده‌سازی مدل embedding چندزبانه برای اپ اندروید StudyQuest.
این را فقط یک‌بار روی کامپیوتر خودت اجرا کن (نه روی گوشی).

نصب پیش‌نیازها (یک‌بار):
    pip install optimum[onnxruntime] onnxruntime onnxruntime-extensions transformers numpy

⚠️ نکته‌ی مهم: بخش export_tokenizer_onnx() از تابع gen_processing_models در
کتابخانه‌ی onnxruntime-extensions استفاده می‌کند. امضای دقیق این تابع بین نسخه‌ها
کمی فرق می‌کند — اگر ارور گرفتی، مستندات فعلی را اینجا چک کن:
https://github.com/microsoft/onnxruntime-extensions
من این اسکریپت را در محیط خودم اجرا/تست نکرده‌ام چون دسترسی اینترنت ندارم؛
پس این نسخه‌ی اول را به‌عنوان نقطه‌ی شروع در نظر بگیر، نه محصول نهایی.

خروجی نهایی (این ۳ فایل را به app/src/main/assets/ در پروژه‌ی اندرویدت کپی کن):
  - model_int8.onnx          (خود مدل، کوانتیزه‌شده به int8)
  - tokenizer.onnx           (توکنایزر، به‌صورت گراف ONNX جدا)
  - intent_embeddings.json   (بردارهای از پیش‌محاسبه‌شده‌ی هر intent)
"""

import json
from pathlib import Path
import numpy as np

MODEL_ID = "intfloat/multilingual-e5-small"
OUT_DIR = Path("onnx_export")
OUT_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------
# مرحله ۱: خروجی‌گرفتن مدل به ONNX با optimum
# ---------------------------------------------------------------
def export_model():
    from optimum.onnxruntime import ORTModelForFeatureExtraction
    from transformers import AutoTokenizer

    print("در حال دانلود و تبدیل مدل به ONNX ... (ممکنه چند دقیقه طول بکشه)")
    model = ORTModelForFeatureExtraction.from_pretrained(MODEL_ID, export=True)
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model.save_pretrained(OUT_DIR)
    tokenizer.save_pretrained(OUT_DIR)
    print("✅ تبدیل به ONNX انجام شد →", OUT_DIR)


# ---------------------------------------------------------------
# مرحله ۲: کوانتیزه‌کردن به int8 برای کاهش حجم
# ---------------------------------------------------------------
def quantize_model():
    from onnxruntime.quantization import quantize_dynamic, QuantType

    src = OUT_DIR / "model.onnx"
    dst = OUT_DIR / "model_int8.onnx"
    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QUInt8)
    size_mb = dst.stat().st_size / (1024 * 1024)
    print(f"✅ کوانتیزه شد → {dst}  (حجم واقعی: {size_mb:.1f} مگابایت)")
    return size_mb


# ---------------------------------------------------------------
# مرحله ۳: ساخت توکنایزر به‌صورت گراف ONNX جدا
# (این کار باعث می‌شه تو جاوا نیازی به پیاده‌سازی دستی SentencePiece/BPE نباشه)
# ---------------------------------------------------------------
def export_tokenizer_onnx():
    from onnxruntime_extensions import gen_processing_models

    print("در حال ساخت گراف ONNX توکنایزر ...")
    pre_m, _ = gen_processing_models(str(OUT_DIR), pre_kwargs={"WITH_DEFAULT_INPUTS": True})
    tok_path = OUT_DIR / "tokenizer.onnx"
    with open(tok_path, "wb") as f:
        f.write(pre_m.SerializeToString())
    print("✅ توکنایزر ONNX ساخته شد →", tok_path)
    print("   بعد از این مرحله، فایل رو با نرم‌افزار Netron باز کن و اسم دقیق")
    print("   ورودی/خروجی‌های گراف رو یادداشت کن — تو IntentMatcher.java لازمت می‌شه.")


# ---------------------------------------------------------------
# مرحله ۴: محاسبه‌ی embedding برای جمله‌های نمونه‌ی هر intent
# ---------------------------------------------------------------
def build_intent_embeddings():
    import onnxruntime as ort
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(OUT_DIR)
    session = ort.InferenceSession(str(OUT_DIR / "model_int8.onnx"))

    def embed(text: str) -> np.ndarray:
        # مدل‌های e5 طبق مستندات خودشون باید با پیشوند "query: " یا "passage: " صدا زده بشن
        inputs = tokenizer("query: " + text, return_tensors="np", padding=True, truncation=True)
        outputs = session.run(None, dict(inputs))
        last_hidden = outputs[0]                             # شکل: (1, seq_len, 384)
        mask = inputs["attention_mask"][..., None]           # شکل: (1, seq_len, 1)
        pooled = (last_hidden * mask).sum(1) / mask.sum(1)    # میانگین‌گیری روی توکن‌ها
        vec = pooled[0]
        return vec / np.linalg.norm(vec)                     # نرمال‌سازی برای شباهت کسینوسی ساده

    with open("intents.json", encoding="utf-8") as f:
        intents = json.load(f)  # { "ask_wake_time": ["ساعت ۱۰ بیدار می‌شم", ...], ... }

    result = {}
    for intent_name, examples in intents.items():
        result[intent_name] = [embed(ex).tolist() for ex in examples]

    out_path = OUT_DIR / "intent_embeddings.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print("✅ embedding همه‌ی intent‌ها ساخته شد →", out_path)


if __name__ == "__main__":
    export_model()
    size_mb = quantize_model()
    export_tokenizer_onnx()
    build_intent_embeddings()
    print("\n=== خلاصه ===")
    print(f"حجم مدل کوانتیزه: {size_mb:.1f} مگابایت")
    print("اگه این عدد از بودجه‌ت بیشتره، مرحله‌ی بعدی «هرس واژگان به فارسی» است — بگو تا اضافه‌ش کنم.")
