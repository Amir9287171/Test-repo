"""
اسکریپت آمادهسازی مدل embedding چندزبانه برای اپ اندروید StudyQuest.

نصب پیشنیازها:
    pip install "optimum[onnxruntime]" onnxruntime onnxruntime-extensions transformers numpy

خروجیها (این ۳ فایل باید به app/src/main/assets/ کپی شوند):
  - model_int8.onnx          مدل کوانتیزهشده int8 (~۱۱۳MB → Git LFS لازم)
  - tokenizer.onnx           توکنایزر بهصورت گراف ONNX
  - intent_embeddings.json   بردارهای از پیشمحاسبهشده هر intent
"""

import json
from pathlib import Path
import numpy as np

MODEL_ID = "intfloat/multilingual-e5-small"
OUT_DIR = Path("onnx_export")
OUT_DIR.mkdir(exist_ok=True)


# ---------------------------------------------------------------
# مرحله ۱: خروجیگرفتن مدل به ONNX با optimum
# ---------------------------------------------------------------
def export_model():
    from optimum.onnxruntime import ORTModelForFeatureExtraction
    from transformers import AutoTokenizer

    print("📥 در حال دانلود و تبدیل مدل به ONNX ...")
    model = ORTModelForFeatureExtraction.from_pretrained(MODEL_ID, export=True)
    model.save_pretrained(OUT_DIR)

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    tokenizer.save_pretrained(OUT_DIR)
    print(f"✅ تبدیل به ONNX انجام شد → {OUT_DIR}")


# ---------------------------------------------------------------
# مرحله ۲: کوانتیزهکردن به int8
# ---------------------------------------------------------------
def quantize_model():
    from onnxruntime.quantization import quantize_dynamic, QuantType

    src = OUT_DIR / "model.onnx"
    dst = OUT_DIR / "model_int8.onnx"
    print("🔧 کوانتیزهکردن به int8 ...")
    quantize_dynamic(str(src), str(dst), weight_type=QuantType.QInt8)
    size_mb = dst.stat().st_size / (1024 * 1024)
    print(f"✅ کوانتیزه شد → {dst}  (حجم: {size_mb:.1f} MB)")
    return size_mb


# ---------------------------------------------------------------
# مرحله ۳: ساخت توکنایزر بهصورت گراف ONNX
# ---------------------------------------------------------------
def export_tokenizer_onnx():
    from transformers import AutoTokenizer
    from onnxruntime_extensions import gen_processing_models

    print("🔧 ساخت گراف ONNX توکنایزر ...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)

    # نکته: ورودی باید خودِ توکنایزر باشد، نه مسیر پوشه.
    # (خطای KeyError: 'onnx_export' قبلاً از همین اشتباه میآمد.)
    pre_model = gen_processing_models(
        tokenizer,
        pre_kwargs={"WITH_DEFAULT_INPUTS": True},
    )
    # در بعضی نسخهها خروجی tuple است، در بعضی یک شیء تنها
    if isinstance(pre_model, tuple):
        pre_model = pre_model[0]

    tok_path = OUT_DIR / "tokenizer.onnx"
    with open(tok_path, "wb") as f:
        f.write(pre_model.SerializeToString())
    size_kb = tok_path.stat().st_size / 1024
    print(f"✅ توکنایزر ONNX ساخته شد → {tok_path}  ({size_kb:.0f} KB)")
    print("   ⚠️ برای دیدن نام دقیق ورودی/خروجیها، فایل را با Netron باز کن.")


# ---------------------------------------------------------------
# مرحله ۴: محاسبهی embedding جملههای نمونه هر intent
# ---------------------------------------------------------------
def build_intent_embeddings():
    import onnxruntime as ort
    from transformers import AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    session = ort.InferenceSession(str(OUT_DIR / "model_int8.onnx"))

    def embed(text: str) -> np.ndarray:
        # E5 برای query باید پیشوند "query: " بگیرد
        inputs = tokenizer(
            "query: " + text,
            return_tensors="np",
            padding=True,
            truncation=True,
            max_length=128,
        )
        outputs = session.run(None, dict(inputs))
        last_hidden = outputs[0]                             # (1, seq_len, 384)
        mask = inputs["attention_mask"][..., None]           # (1, seq_len, 1)
        pooled = (last_hidden * mask).sum(1) / mask.sum(1)   # mean pooling با mask
        vec = pooled[0]
        return vec / np.linalg.norm(vec)                     # نرمالسازی کسینوسی

    with open("intents.json", encoding="utf-8") as f:
        intents = json.load(f)

    result = {}
    for intent_name, examples in intents.items():
        print(f"   • {intent_name}: {len(examples)} نمونه")
        result[intent_name] = [embed(ex).tolist() for ex in examples]

    out_path = OUT_DIR / "intent_embeddings.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)
    print(f"✅ embedding همهی intentها ساخته شد → {out_path}")


# ---------------------------------------------------------------
# اجرا
# ---------------------------------------------------------------
if __name__ == "__main__":
    export_model()
    size_mb = quantize_model()
    export_tokenizer_onnx()
    build_intent_embeddings()

    print("\n" + "=" * 50)
    print(f"حجم مدل کوانتیزه: {size_mb:.1f} MB")
    if size_mb > 95:
        print("⚠️ حجم بالای ۹۵MB — GitHub فایل >۱۰۰MB را رد میکند.")
        print("   راهحل: Git LFS (در workflow تنظیم شده).")
    print("=" * 50)
