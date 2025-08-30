# Privately

![Privately Screenshot](extension/assets/app-image.jpg)  
*<small>Privately</small>*  

**Privately** is a Chrome extension that protects users from unintentionally leaking sensitive information in prompts before submitting them to AI systems. It is designed for developers, students, and knowledge workers who frequently include **code, configs, or personal data** into AI tools.

Our tool is specifically catered to target **PII** within code contexts and especially in the context of Singapore.

Privately combines **regex-based validators** (for exact identifiers like NRIC, phone numbers, credit cards) with a **hosted FastAPI inference server** running a **fine-tuned DistilBERT-base-uncased model** to catch fuzzy PII such as names and addresses.  

---

## 🔄 How It Works

1. **User Input**  
   - User enters prompts into a AI tool as usual. Prompts can include natural language and code.
   - Chrome extension intercepts the input *before submission* and provide annotations to inputted prompt.

2. **Local Regex Validation**  
   - Immediate scanning for structured PII (e.g. phone numbers, NRIC, credit cards).    

3. **Server Model Inference (FastAPI + ONNX Runtime)**  
   - For unstructured / fuzzy entities (names, addresses), the extension sends the text to a **FastAPI backend**.  
   - Backend loads the fine-tuned **DistilBERT model** (quantized to ONNX INT8 for performance).  
   - API responds with entity spans and labels.  

4. **UI Feedback**  
   - Detected entities are underlined in the browser.  
   - Inline tooltips allow:  
     - Redaction  
     - Replacement with custom placeholders  
     - Skip current
     - Ignore all

5. **Submission**  
   - After review/cleanup, the user submits the text to the AI system **without leaking sensitive data**.  

---

## ✨ Features

- **Smart PII Detection**  
  Combines fast **regex validators** (for structured data like emails, phone numbers, NRIC, credit cards) with a **fine-tuned DistilBERT-base-uncased model** (for fuzzy PII like names and addresses). Detection runs in real-time on every input box in Chrome.

- **Inline Tooltips**  
  - Underline detected text and display category (e.g., NAME, ADDR, EMAIL).  
  - One-click actions: **Remove**, **Replace with custom placeholder**, **Skip once**, or **Ignore all** for that category.  

- **User Control & Transparency**  
  - Categories are fully **toggleable** in the options panel.  
  - Tooltip always shows both the detected text and its **probable category**, so you understand *why* it was flagged.  

- **Seamless Chrome Integration**  
  - Works across all websites in the browser.  
  - Lightweight extension with no external dependencies.  
  - All detections happen before submission

---

## 🗂️ Detection Categories

### ✅ Regex-Based Categories
- **Emails** (standard + RFC validation)  
- **Phone Numbers**
- **URLs & IP Addresses**  
- **NRIC/FIN** 
- **Postal Codes**  
- **Credit Cards** 
- **JWTs**
- **Authorization Headers, Cookies**  
- **File Paths**
- **UUID/GUIDs**  

### 🤖 Model-Based Categories (via DistilBERT-base-uncased + ONNX)  
- **PER (Names)**  
  - Multicultural names (Chinese, Malay, Indian, Western, initials, hyphenated).  
- **ADDR (Addresses)**  
  - Global + Singapore addresses (HDB, condo, commercial, postal, block/unit).  

---

## Fine-Tuning DistilBERT-base-uncased
### 📊 Dataset Creation

Since real-world PII datasets within code prompts are difficult to obtain, synthetic dataset is created to train the model

1. **Source Data**  
   - CSV file (`pii_database.csv`) with **`name`** and **`address`** columns.  
   - Contains multicultural names (Malay, Chinese, Indian, Western) and Singapore-style addresses (HDB blocks, streets, condos, etc.).
   - Name and Address data is obtained from Singapore based datasets obtainable online.

2. **Synthetic Sentence Generation**  
   - A Python script reads from the CSV and generates natural + code-like snippets.
   - Embeds PII in code like environment
   - Adds Fuzz and variation

3. **Auto-Annotation**  
   - Every generated text snippet includes offsets (`start`, `end`) pointing to the **NAME** and **ADDR** spans.  

4. **Export Format**  
   - Final dataset is stored in **JSONL** format for training.  

---

### 🧑‍🏫 Model Training

The model is a fine-tuned **DistilBERT-base-uncased** for token classification:

1. **Preprocessing**  
   - Tokenized text with `AutoTokenizer.from_pretrained("distilbert-base-uncased")`.  
   - Converted annotated spans into **BIO tags**:  
     - `B-NAME`, `I-NAME` for names  
     - `B-ADDR`, `I-ADDR` for addresses  
     - `O` for non-PII tokens  

2. **Fine-Tuning**  
   - Used Hugging Face **Trainer API**:  
   - Trained for multiple epochs with cross-entropy loss on token labels.  
   - Split dataset into **train / validation** (e.g., 80/20).  

3. **Saving & Export**  
   - Saved the Hugging Face model:  
   - Exported to **ONNX**
   - Quantized to **INT8** for faster inference

4. **Deployment**  
   - The quantized ONNX model (`onnx_int8/`) is served with **FastAPI**.  
   - Extension sends text → FastAPI → ONNX Runtime inference → returns detected PII spans.

---

### 📈 Why This Approach?

- **Robustness**: Fuzzing (case, spacing, typos, noise) improves generalization.  
- **Efficiency**: ONNX + INT8 quantization reduces model size and speeds up inference.  
- **Scalability**: Hosted via FastAPI → can be deployed serverless or containerized.  




## 🛠️ Tech Stack

- **Frontend**:  
  - Chrome Extension (Manifest V3, content scripts + service worker). 
  - Regex validator in JavaScript 

- **Backend (PII Detection)**:   
  - Fine-tuned **DistilBERT-base-uncased** → exported to **ONNX (INT8)**.  
  - **FastAPI** serving inference with **ONNX Runtime**.  

- **Training**:  
  - Fine-tuned on **Singapore-specific datasets** (names, addresses, orgs).  
  - Hugging Face Transformers → Optimum ONNX → quantized INT8.  

- **API Communication**:  
  - Chrome extension → FastAPI `/detect` endpoint.  
  - JSON response with spans + labels.  

---

## 🚀 Installation

1. Clone this repo:  
   ```bash
   git clone https://github.com/your-org/privately.git
   cd privately

2. Load extension directory into chrome browser

## Project Structure
```
privately/
├─ extension/                 # Chrome extension (MV3)
│  ├─ manifest.json
│  ├─ assets/
│  └─ src/
│     ├─ content.js           # inline detection + tooltip
│     ├─ overlay.css          # styles for highlights/tooltips
│     ├─ popup.html
│     ├─ popup.js             # dashboard popup
│     ├─ options.html
│     └─ options.js           # settings (categories, modes)
├─ server/                    # FastAPI backend for PII model
│  ├─ main.py                 # FastAPI app (model inference)
│  ├─ onnx_int8/              # Model + tokenizer files
├─ web-dashboard/             # Lynx web dashboard
└─ README.md
```
