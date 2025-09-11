import tkinter as tk
from tkinter import messagebox, filedialog
from tkinter import ttk
import datetime, csv, os, threading, re, json
from urllib.request import urlopen, Request
import signal
import time
from urllib.parse import urlencode

# ================== SIGINT(Stop) 시 깔끔 종료 ==================
def _sigint_handler(signum, frame):
    try:
        app_root = globals().get("root")
        if app_root:
            app_root.quit()
    except Exception:
        pass
signal.signal(signal.SIGINT, _sigint_handler)

# 최상단 상수 정의 부근에 추가
def _user_data_dir():
    base = os.environ.get("LOCALAPPDATA") or os.environ.get("APPDATA") or os.path.expanduser("~")
    path = os.path.join(base, "CNSValuator")  # 프로그램 전용 폴더
    os.makedirs(path, exist_ok=True)
    return path

APP_DATA_DIR = _user_data_dir()

# 기존:
# AUTOSAVE_PATH = "valuation_history_autosave.csv"
# INPUTS_AUTOSAVE_PATH = "valuation_history_inputs_autosave.json"

# 변경:
AUTOSAVE_PATH = os.path.join(APP_DATA_DIR, "valuation_history_autosave.csv")
INPUTS_AUTOSAVE_PATH = os.path.join(APP_DATA_DIR, "valuation_history_inputs_autosave.json")


# ===== 히스토리 전역/CSV 컬럼 =====
inputs_store = {}          # UID -> inputs (불러오기용)
history_rows = []          # Treeview/CSV 동기화
CSV_FIELDNAMES = ["UID", "시간", "물건명", "등급",
                  "임대안정성", "임대안정성설명",
                  "접근성등급", "접근성설명",
                  "시설등급", "시설설명",
                  "Market Value", "Value-Add Potential", "HBU Value",
                  "NOI", "CapRate(%)"]

# ================== 설명 사전 ==================
GRADE_DESCRIPTIONS = {
    1: "핵심입지이며, 공실률이 낮고 빠르게 변화하고 있는 지역 ",
    2: "핵심입지이나, 공실률이 평균보다 높고 변화가 예정되어있는 지역 ",
    3: "비핵심지역이며, 주변상권이 잘 형성되어있으며, 거래가 활성화 되어있는 지역",
    4: "비핵심지역이고, 주변상권은 형성되어 있으나 공실상태가 눈에 띄이게 보이는 지역",
    5: "비핵심지역이면서, 주변 상권이 형성되어 있지 않은 곳이나 골목상권지역",
}
ACCESSIBILITY_DESCRIPTIONS = {
    1: "대중교통/주요도로 접근이 용이하고 주차시설 여유로움",
    2: "대중교통/도로 접근 양호하거나 양호한 주차시설",
    3: "보통 수준의 접근성을 가졌거나 평이한 주차시설.",
    4: "교통/도로 접근 불편하거나 열악한 주차시설",
    5: "접근성 매우 열악하거나 매우 부족한 주차시설"
}
FACILITY_DESCRIPTIONS = {
    1: "우수(신축 5년이내 혹은 눈에 띄이는 익스테리어)",
    2: "양호(신축 12년 혹은 사소한 보수 필요없는 상태)",
    3: "보통(신축 20년 이내 혹은 사소한 보수가 눈에 띄임)",
    4: "미흡(신축 30년 이내 혹은 설비가 노후되어 교체나 대대적인 보수가 필요한 상태)",
    5: "열악(전면적 개보수 필요)"
}
STABILITY_DESCRIPTIONS = {
    1: "장기계약·우량임차인·신뢰도 높으며, 공실위험 매우 낮음",
    2: "공기업 및 신뢰할 수 있는 평균 이상 수준의 계약, 만기 분산도 잘 되어있음.",
    3: "신뢰도 높은 임차인과 소상공인의 혼재. 만기분산이 잘 안되어있음. 신용도 보통",
    4: "소상공인 위주의 임차인 구성, 경기영향 크게 받는 업종, 계약상 리스크가 있음.",
    5: "공실위험이 높으며, 임대료 변동성 높고 신뢰도 낮은 업종(유흥,혐오시설)"
}

# ================== 등급별 계수(기본가치 대비 %) ==================
LOCATION_FACTORS = {  1: +0.001, 2: -0.02, 3: -0.037, 4: -0.06, 5: -0.1 }   # 입지
STABILITY_FACTORS = { 1: -0.02, 2: -0.05, 3: -0.065, 4: -0.0, 5: -0.1 }    # 임대안정성
ACCESS_FACTORS = {   1: +0.0001, 2: -0.035, 3: -0.05, 4: -0.10, 5: -0.15 } # 접근성
FACILITY_FACTORS = { 1: +0.0001, 2: -0.015, 3: -0.03, 4: -0.045, 5: -0.06 }# 시설

# ================== 가벼운 디버그 로거 ==================
DEBUG_ENABLED = True
def log_debug(msg: str):
    if DEBUG_ENABLED:
        try:
            print(msg)
        except Exception:
            pass

# ================== KOSIS API (자동) ==================
KOSIS_API_KEY = "MDM1MGMwN2NmYjc2NDgyMGI0M2Y5YmE0NWJhYzllMDQ="  # 제공 키(= 누락 시 아래에서 보정)
KOSIS_API_ENDPOINT = "https://kosis.kr/openapi/Param/statisticsParameterData.do"
KOSIS_API_PARAMS_BASE = {
    "method": "getList",
    "apiKey": KOSIS_API_KEY,
    "itmId": "T001",                 # 중대형 상가 공실률
    "objL1": "ALL",                  # 상권 전체
    "format": "json",
    "jsonVD": "Y",
    "prdSe": "Q",                    # 분기
    "newEstPrdCnt": "4",             # 최근 4개 분기
    # 값/기간/지역명을 반드시 받도록 필드 확장
    "outputFields": "TBL_NM+PRD_DE+DT+UNIT_NM+OBJ_NM+C1_NM+ITM_NM+NM",
    "orgId": "408",
    "tblId": "DT_40801_N220201_06",
}
kosis_api_rows_cache = []   # 정규화된 로우 목록 (API)
kosis_api_cached_at = 0.0
KOSIS_CACHE_TTL_SEC = 600   # 10분 캐시
kosis_addr_after_id = None  # 주소 변경 디바운스 타이머

def _build_kosis_url():
    params = dict(KOSIS_API_PARAMS_BASE)
    # apiKey 끝에 '=' 누락 입력을 보정
    if not params.get("apiKey", "").endswith("="):
        params["apiKey"] = params["apiKey"] + "="
    # '+'를 그대로 두기 위해 safe='+' 유지
    return KOSIS_API_ENDPOINT + "?" + urlencode(params, safe='+')

def _normalize_kosis_rows(raw_obj):
    """
    KOSIS JSON(리스트 또는 dict.list 등)을 통일 스키마로 변환:
    [{'region','vacancy','period','group'}...]
    """
    if isinstance(raw_obj, dict):
        raw_list = None
        for k in ("list", "LIST", "StatData", "statData", "data"):
            if isinstance(raw_obj.get(k), list):
                raw_list = raw_obj[k]
                break
        raw_list = raw_list or []
    elif isinstance(raw_obj, list):
        raw_list = raw_obj
    else:
        raw_list = []

    norm = []
    for r in raw_list:
        region = (r.get("C1_NM") or r.get("OBJ_NM") or "").strip()
        vac    = _nz(r.get("DT"), None)
        period = (r.get("PRD_DE") or r.get("NM") or "").strip()
        group  = (r.get("ITM_NM") or r.get("TBL_NM") or "상권별").strip()
        if region and vac is not None:
            norm.append({"region": region, "vacancy": float(vac), "period": period, "group": group})
    return norm

def fetch_kosis_api_rows():
    """KOSIS API에서 원시데이터를 가져와 정규화된 리스트로 반환"""
    try:
        url = _build_kosis_url()
        log_debug(f"[KOSIS] GET {url}")
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=12) as resp:
            raw = resp.read().decode("utf-8", errors="ignore")
        data = json.loads(raw)
        rows = _normalize_kosis_rows(data)
        if not rows:
            log_debug("[KOSIS] 응답은 성공했으나 유효한 행이 없습니다.")
        return True, rows, None
    except Exception as e:
        log_debug(f"[KOSIS] 오류: {e}")
        return False, [], e

def fetch_kosis_api_rows_async(on_done, force=False):
    """
    캐시(10분) 사용. force=True면 강제 새로고침.
    on_done(ok, rows, err) 콜백은 메인스레드에서 호출.
    """
    now = time.time()
    if (not force) and kosis_api_rows_cache and (now - kosis_api_cached_at < KOSIS_CACHE_TTL_SEC):
        root.after(0, lambda: on_done(True, list(kosis_api_rows_cache), None))
        return

    def _work():
        ok, rows, err = fetch_kosis_api_rows()
        def _apply():
            global kosis_api_rows_cache, kosis_api_cached_at
            if ok and rows:
                kosis_api_rows_cache = rows
                kosis_api_cached_at = time.time()
            on_done(ok, rows, err)
        root.after(0, _apply)

    threading.Thread(target=_work, daemon=True).start()

def _latest_by_region(rows):
    """같은 지역 중 최신(period) 1건으로 요약"""
    best = {}
    for r in rows:
        key = r["region"]
        p = _parse_period_value(r.get("period"))
        cur = best.get(key)
        if (cur is None) or (_parse_period_value(cur.get("period")) < p):
            best[key] = r
    return list(best.values())

def _rank_for_address(rows, address_text):
    """주소와의 유사도로 랭킹(부분일치/토큰중첩 + 최신 분기 가점)"""
    addr = (address_text or "").strip()
    addr_norm = _normalize_txt(addr)
    tokens = [_normalize_txt(t) for t in re.split(r"\s+", addr) if len(t) >= 2]
    tokens = [t for t in tokens if t]

    def score(r):
        rn = _normalize_txt(r["region"])
        sc = 0
        if rn and (rn in addr_norm or addr_norm in rn):
            sc += 1000  # 강한 가점(완전/부분포함)
        ov = sum(1 for t in tokens if t in rn)
        sc += ov * 10   # 토큰중첩 가점
        sc = sc * 1_000_000 + _parse_period_value(r.get("period"))
        return sc

    return sorted(rows, key=score, reverse=True)

def _apply_kosis_row(row):
    """선택/자동매칭 결과를 UI에 반영 (지역/값 분리 표시)"""
    if not row:
        kosis_region_var.set("")
        kosis_period_var.set("")
        kosis_vacancy_pct_var.set(0.0)
        kosis_vacancy_text_var.set("N/A")
        return
    vac    = float(row.get("vacancy", 0.0))
    per    = (row.get("period") or "").strip()
    region = (row.get("region") or "").strip()

    kosis_region_var.set(region)               # 화면 표시: 지역
    kosis_period_var.set(per)                  # 내부 저장: 분기/시점
    kosis_vacancy_pct_var.set(vac)             # 숫자값
    kosis_vacancy_text_var.set(f"{vac:.1f}%")  # 화면 표시: "X.X%"

def trigger_kosis_autofill(force=False):
    """
    주소를 기반으로 최적 상권 자동선택(부분일치 또는 토큰 1개 이상 매칭 시 적용)
    """
    addr = entry_property_address.get().strip()
    if not addr:
        _apply_kosis_row(None)
        return

    def _on(ok, rows, err):
        if not ok or not rows:
            _apply_kosis_row(None)
            if err:
                log_debug(f"[KOSIS] 자동조회 실패: {err}", parent=root)
            return
        latest = _latest_by_region(rows)
        ranked = _rank_for_address(latest, addr)
        top = ranked[0] if ranked else None

        # 충분한 매칭 판정(부분 포함 또는 토큰 1개 이상 겹침)
        is_ok = False
        if top:
            rn = _normalize_txt(top["region"])
            addr_norm = _normalize_txt(addr)
            if rn and (rn in addr_norm or addr_norm in rn):
                is_ok = True
            else:
                toks = [_normalize_txt(t) for t in re.split(r"\s+", addr) if len(t) >= 2]
                if any(t and t in rn for t in toks):
                    is_ok = True

        if is_ok:
            _apply_kosis_row(top)
        else:
            # 자동 매칭 불충분: N/A 유지(원하면 '수동 불러오기'로 수동 선택)
            _apply_kosis_row(None)

    fetch_kosis_api_rows_async(_on, force=force)

def on_address_changed(event=None):
    """주소 입력 디바운스 후 자동 조회"""
    try:
        global kosis_addr_after_id
        if kosis_addr_after_id:
            try:
                root.after_cancel(kosis_addr_after_id)
            except Exception:
                pass
            kosis_addr_after_id = None

        def _go():
            try:
                trigger_kosis_autofill(force=False)
            except Exception as e:
                print(f"주소 변경 처리 중 오류: {e}")
        # 700ms 디바운스
        kosis_addr_after_id = root.after(700, _go)
    except Exception as e:
        print(f"주소 변경 이벤트 처리 중 오류: {e}")

def open_kosis_api_selector(address_text: str):
    """API 데이터에서 지역 후보를 직접 선택하는 팝업"""
    def _build_popup(rows_latest):
        dlg = tk.Toplevel(root)
        dlg.title("KOSIS 공실률 선택 (API)")
        dlg.transient(root); dlg.grab_set()
        dlg.geometry("640x480")

        frm = tk.Frame(dlg, padx=10, pady=8); frm.pack(fill="both", expand=True)
        tk.Label(frm, text="검색어:").pack(anchor="w")
        q_var = tk.StringVar(value=address_text or "")
        q_entry = tk.Entry(frm, textvariable=q_var); q_entry.pack(fill="x")

        lst = tk.Listbox(frm, height=16); lst.pack(fill="both", expand=True, pady=(6,6))
        display_rows = []

        def rebuild_list():
            nonlocal display_rows
            q = _normalize_txt(q_var.get())
            items = []
            for r in rows_latest:
                region = r.get("region","")
                period = r.get("period","") or "-"
                vac = float(r.get("vacancy",0.0))
                if q:
                    rn = _normalize_txt(region)
                    if q not in rn:
                        continue
                items.append((region, period, vac, r))

            def scr(it):
                region, period, vac, raw = it
                rn = _normalize_txt(region)
                toks = [_normalize_txt(t) for t in re.split(r"\s+", q_var.get()) if len(t) >= 2]
                match = sum(1 for t in toks if t and t in rn)
                return (match, _parse_period_value(period))
            items.sort(key=scr, reverse=True)
            display_rows = items[:200]

            lst.delete(0, tk.END)
            for region, period, vac, raw in display_rows:
                lst.insert(tk.END, f"{region} | {period} | {vac:.1f}%")

        def do_apply():
            sel = lst.curselection()
            if not sel:
                messagebox.showinfo("선택", "항목을 선택해 주세요.")
                return
            _, _, _, raw = display_rows[sel[0]]
            _apply_kosis_row(raw)
            dlg.destroy()

        def on_dbl(_e): do_apply()

        btns = tk.Frame(frm); btns.pack(fill="x")
        tk.Button(btns, text="새로고침", command=lambda: trigger_kosis_autofill(force=True)).pack(side="left")
        tk.Button(btns, text="적용", command=do_apply).pack(side="right")
        tk.Button(btns, text="닫기", command=dlg.destroy).pack(side="right", padx=(0,6))

        lst.bind("<Double-1>", on_dbl)
        q_entry.bind("<KeyRelease>", lambda _e: rebuild_list())

        rebuild_list()
        q_entry.focus_set()

    def _on(ok, rows, err):
        if not ok:
            messagebox.showerror("KOSIS 오류", f"API 호출 실패:\n{err}")
            return
        rows_latest = _latest_by_region(rows)
        _build_popup(rows_latest)

    fetch_kosis_api_rows_async(_on, force=False)

def _nz(v, default=0.0):
    try:
        if v is None: return default
        if isinstance(v, (int, float)): return float(v)
        s = str(v).strip().replace(",", "").replace("%", "")
        return float(s) if s != "" else default
    except Exception:
        return default

def _normalize_txt(s: str) -> str:
    s = str(s or "").strip()
    # 공백/특수문자 제거 (한글 유지)
    s = re.sub(r"[\s\(\)\[\]\-_,./·]+", "", s)
    return s.lower()

def _parse_period_value(p: str) -> int:
    """
    기간 문자열을 정렬 가능 숫자로 변환 (예: '2025Q2' -> 20252, '2024-09' -> 202409, 미확정 -> 0)
    """
    p = str(p or "").strip().upper()
    if not p:
        return 0
    # 'YYYYQn' / 'YYYY-Qn' / 'YYYY Qn'
    m = re.match(r"^(\d{4})\s*Q\s*([1-4])$", p) or re.match(r"^(\d{4})-Q([1-4])$", p) or re.match(r"^(\d{4})Q([1-4])$", p)
    if m:
        return int(m.group(1)) * 10 + int(m.group(2))
    # 'YYYYMM' / 'YYYY-MM'
    m = re.match(r"^(\d{4})[-/]?(\d{2})$", p)
    if m:
        return int(m.group(1)) * 100 + int(m.group(2))
    # 'PRD_DE' 형태 (예: 20252 => 2025 Q2 로 간주)
    m = re.match(r"^(\d{4})([1-4])$", p)
    if m:
        return int(m.group(1)) * 10 + int(m.group(2))
    # 숫자만인 경우
    m = re.match(r"^\d+$", p)
    if m:
        try: return int(p)
        except: return 0
    return 0

# ================== PDF/폰트 유틸 ==================
_result_logo_path = ""      # 상단 로고 경로(선택)
_result_font_path = ""      # PDF 임베드 폰트 경로(TTF/OTF) - 사용자 지정 우선
_last_result_payload = {}   # PDF 저장용
_investigator_name = ""
_opinion_text = ""

def choose_font():
    """PDF 임베드용 한글 폰트(TTF/OTF) 선택"""
    global _result_font_path
    path = filedialog.askopenfilename(
        title="PDF 임베드 폰트 선택(TTF/OTF)",
        filetypes=[("Font files","*.ttf;*.otf")]
    )
    if path:
        _result_font_path = path
        messagebox.showinfo("폰트", f"임베드 폰트를 설정했습니다.\n{_result_font_path}")

def _find_korean_font_path():
    candidates = []
    if _result_font_path:
        candidates.append(_result_font_path)
    candidates += [
        r"C:\Windows\Fonts\malgun.ttf",
        r"C:\Windows\Fonts\malgunbd.ttf",
        r"C:\Windows\Fonts\NanumGothic.ttf",
        r"C:\Windows\Fonts\NanumGothicBold.ttf",
        r"C:\Windows\Fonts\NotoSansKR-Regular.otf",
        r"C:\Windows\Fonts\NotoSansKR-Regular.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansKR-Regular.ttf",
        "/Library/Fonts/AppleGothic.ttf",
        "/Library/Fonts/NanumGothic.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    ]
    for p in candidates:
        if p and os.path.isfile(p):
            return p
    return None

# ================== 계산/레포트(텍스트) ==================
def calculate_property_value(noi, cap_rate):
    try:
        return noi / cap_rate
    except ZeroDivisionError:
        return None

# ================== GUI 생성(루트) ==================
root = tk.Tk()
root.title("상업용(Retail/office) 부동산 가치 평가 결과")
root.geometry("1200x800")  # 창 크기 고정
root.resizable(True, True)  # 창 크기 조절 가능
root.grid_columnconfigure(0, weight=0)
root.grid_columnconfigure(1, weight=0)
root.grid_columnconfigure(2, weight=1)

# 오류 처리 개선
def safe_exit():
    try:
        root.quit()
        root.destroy()
    except:
        pass

root.protocol("WM_DELETE_WINDOW", safe_exit)

# --- (중요) KOSIS 상태 변수: 라벨/스핀박스 등에서 쓰기 전에 반드시 생성 ---
# master=root 를 명시해 설치본/런타임 환경에서도 안전하게 동작하도록 함
kosis_vacancy_pct_var  = tk.DoubleVar(master=root, value=0.0)   # 숫자값 (%)
kosis_region_var       = tk.StringVar(master=root, value="")    # 지역 라벨
kosis_vacancy_text_var = tk.StringVar(master=root, value="N/A") # 값 라벨 ("X.X%")
kosis_period_var       = tk.StringVar(master=root, value="")    # 내부 저장용(표시 X)

# (NEW) 메시지박스 기본 parent를 root로 강제하는 패치
def _patch_messagebox_parent(root_widget):
    import tkinter.messagebox as _mb
    _orig = {
        "showinfo": _mb.showinfo,
        "showwarning": _mb.showwarning,
        "showerror": _mb.showerror,
        "askyesno": _mb.askyesno,
        "askokcancel": _mb.askokcancel,
        "askquestion": _mb.askquestion
    }
    def _wrap(fn):
        def _inner(title, message, **kwargs):
            # parent 미지정 시 root를 기본으로
            if "parent" not in kwargs or kwargs["parent"] is None:
                try:
                    if root_widget.winfo_exists():
                        kwargs["parent"] = root_widget
                except Exception:
                    pass
            return fn(title, message, **kwargs)
        return _inner
    for k, v in _orig.items():
        setattr(_mb, k, _wrap(v))

_patch_messagebox_parent(root)

# ================== 숫자 포맷 ==================
def format_number(event):
    try:
        entry = event.widget
        value = entry.get().replace(",", "")
        if value.strip() == "":
            return
        try:
            if "." in value:
                num = float(value)
                entry.delete(0, tk.END)
                entry.insert(0, f"{num:,.2f}")
            else:
                num = int(float(value))
                entry.delete(0, tk.END)
                entry.insert(0, f"{num:,}")
        except ValueError:
            pass
    except Exception as e:
        print(f"숫자 포맷 처리 중 오류: {e}")

# ================== 입력 필드 생성 ==================
def create_entry(row, label_text, description_text=None, bind_format=True):
    tk.Label(root, text=label_text).grid(row=row, column=0, sticky='e', padx=(6,4), pady=(2,2))
    entry = tk.Entry(root, width=40 if "주소" in label_text else 20)
    entry.grid(row=row, column=1, sticky='w', padx=(4,6), pady=(2,2))
    if bind_format: entry.bind("<KeyRelease>", format_number)
    next_row=row+1
    if description_text:
        tk.Label(root, text=description_text, font=("맑은 고딕",8), fg="grey")\
          .grid(row=next_row, column=1, sticky="w", padx=6, pady=(0,4))
        next_row += 1
    return entry, next_row

row = 0
entry_property_name, row   = create_entry(row, "물건명:", "평가할 부동산 물건의 이름", bind_format=False)
entry_property_address, row= create_entry(row, "물건 주소:", "부동산의 주소를 입력", bind_format=False)

entry_property_address.bind("<KeyRelease>", on_address_changed)
entry_property_address.bind("<FocusOut>", on_address_changed)

# --- 월간 임대료 총액/월 + 현재 공실률(%) 한 줄 구성 ---
tk.Label(root, text="월간 임대료 총액/월:").grid(row=row, column=0, sticky='e', padx=(6,4), pady=(2,2))
rent_row_frame = tk.Frame(root); rent_row_frame.grid(row=row, column=1, sticky='w', padx=(4,6), pady=(2,2))
entry_monthly_rent = tk.Entry(rent_row_frame, width=20)
entry_monthly_rent.pack(side="left")
entry_monthly_rent.bind("<KeyRelease>", format_number)
# 설명 라벨(다음 줄)
tk.Label(root, text="전체 임대료 합계액 (Excluding VAT)", font=("맑은 고딕",8), fg="grey")\
  .grid(row=row+1, column=1, sticky="w", padx=6, pady=(0,4))
row += 2

entry_deposit, row         = create_entry(row, "보증금 총액:", "전체 임대 보증금 합계액")
entry_ad_income, row       = create_entry(row, "광고수익/월:","광고, 미디어와 관련해 발생 수익 (Excluding VAT)")
entry_parking_income, row  = create_entry(row, "주차수익/월:","월별 주차시설내에서 발생하는 수익.(Excluding VAT)")
entry_other_income, row    = create_entry(row, "기타수익/월:","자판기·부대시설 등 기타 부수적인 월간 고정 수익.")
entry_facility_costs, row  = create_entry(row, "시설 관리비 총액/월:","건물 유지·보수 등 임차인에게 청구하는 모든 시설 관련 금액.")
entry_management_rate, row = create_entry(row, "관리수익률(%):","시설 관리비를 기준으로 기대 수익률(%) 입력.")

# 매매기준 수익률 + 기준금리
tk.Label(root, text="매매기준 수익률(%):").grid(row=row, column=0, sticky='e', padx=(6,4), pady=(2,2))
cap_row_frame = tk.Frame(root); cap_row_frame.grid(row=row, column=1, sticky='w', padx=(4,6), pady=(2,2))
spin_cap_rate = tk.Spinbox(cap_row_frame, from_=0.1, to=20.0, increment=0.1, format="%.1f", width=10)
spin_cap_rate.pack(side="left"); spin_cap_rate.delete(0, tk.END); spin_cap_rate.insert(0, "4.3")

# 기준금리 라벨 변수
bok_rate_var = tk.StringVar(value="기준금리 조회중…")
tk.Label(cap_row_frame, textvariable=bok_rate_var, font=("맑은 고딕",8), fg="grey").pack(side="left", padx=(8,4))

def fetch_bok_base_rate(target_var):
    def _work():
        txt="기준금리 표시 없음"; headers={"User-Agent":"Mozilla/5.0"}
        urls=[("https://www.bok.or.kr/eng/main/main.do", r"BOK\s*Base\s*Rate[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*%"),
              ("https://www.bok.or.kr/portal/main/main.do", r"기준\s*금리[^0-9]*([0-9]+(?:\.[0-9]+)?)\s*%")]
        for url,pat in urls:
            try:
                req=Request(url, headers=headers)
                with urlopen(req, timeout=8) as resp:
                    html=resp.read().decode("utf-8", errors="ignore")
                m=re.search(pat, html, re.IGNORECASE)
                if m:
                    txt=f"기준금리 {m.group(1)}%"; break
            except Exception:
                continue
        root.after(0, lambda: target_var.set(txt))
    threading.Thread(target=_work, daemon=True).start()

tk.Button(cap_row_frame, text="↻", font=("맑은 고딕",8),
          command=lambda: fetch_bok_base_rate(bok_rate_var), padx=4).pack(side="left")
fetch_bok_base_rate(bok_rate_var)

tk.Label(root, text="지역별로 거래 기준이 되는 자산수익률(%) 입력",
         font=("맑은 고딕",8), fg="grey").grid(row=row+1, column=1, sticky="w", padx=6, pady=(0,4))
row += 2

# 등급(입지/임대안정성/접근성/시설)
tk.Label(root, text="입지 등급 (1~5):").grid(row=row, column=0, sticky='e', padx=(6,4), pady=(6,2))
grade_line = tk.Frame(root); grade_line.grid(row=row, column=1, sticky='w', padx=(4,6), pady=(6,2))
grade_combo = ttk.Combobox(grade_line, values=["1등급지","2등급지","3등급지","4등급지","5등급지"], state="readonly", width=10)
grade_combo.pack(side="left"); grade_combo.current(0)
row += 1
grade_desc_var = tk.StringVar()
tk.Label(root, textvariable=grade_desc_var, font=("맑은 고딕",8), fg="grey")\
  .grid(row=row, column=1, sticky="w", padx=6, pady=(0,6))
row += 1
def update_grade_desc(event=None):
    try:
        text=grade_combo.get(); digits="".join([c for c in text if c.isdigit()])
        num=int(digits) if digits else 1; grade_desc_var.set(GRADE_DESCRIPTIONS.get(num,""))
    except Exception as e:
        print(f"등급 설명 업데이트 중 오류: {e}")
grade_combo.bind("<<ComboboxSelected>>", update_grade_desc); update_grade_desc()

tk.Label(root, text="임대 안정성 (1~5):").grid(row=row, column=0, sticky='e', padx=(6,4), pady=(6,2))
stability_combo = ttk.Combobox(root, values=["1등급","2등급","3등급","4등급","5등급"], state="readonly", width=10)
stability_combo.grid(row=row, column=1, sticky='w', padx=(4,6), pady=(6,2)); stability_combo.current(1)
row += 1
stab_desc_var = tk.StringVar()
tk.Label(root, textvariable=stab_desc_var, font=("맑은 고딕",8), fg="grey").grid(row=row, column=1, sticky="w", padx=6, pady=(0,6))
row += 1
def update_stab_desc(event=None):
    try:
        text=stability_combo.get(); digits="".join([c for c in text if c.isdigit()])
        num=int(digits) if digits else 2; stab_desc_var.set(STABILITY_DESCRIPTIONS.get(num,""))
    except Exception as e:
        print(f"임대안정성 설명 업데이트 중 오류: {e}")
stability_combo.bind("<<ComboboxSelected>>", update_stab_desc); update_stab_desc()

tk.Label(root, text="접근성 등급 (1~5):").grid(row=row, column=0, sticky='e', padx=(6,4), pady=(6,2))
accessibility_combo = ttk.Combobox(root, values=["1등급","2등급","3등급","4등급","5등급"], state="readonly", width=10)
accessibility_combo.grid(row=row, column=1, sticky='w', padx=(4,6), pady=(6,2)); accessibility_combo.current(2)
row += 1
acc_desc_var = tk.StringVar()
tk.Label(root, textvariable=acc_desc_var, font=("맑은 고딕",8), fg="grey").grid(row=row, column=1, sticky="w", padx=6, pady=(0,6))
row += 1
def update_acc_desc(event=None):
    try:
        text=accessibility_combo.get(); digits="".join([c for c in text if c.isdigit()])
        num=int(digits) if digits else 3; acc_desc_var.set(ACCESSIBILITY_DESCRIPTIONS.get(num,""))
    except Exception as e:
        print(f"접근성 설명 업데이트 중 오류: {e}")
accessibility_combo.bind("<<ComboboxSelected>>", update_acc_desc); update_acc_desc()

tk.Label(root, text="시설 등급 (1~5):").grid(row=row, column=0, sticky='e', padx=(6,4), pady=(6,2))
facility_combo = ttk.Combobox(root, values=["1등급","2등급","3등급","4등급","5등급"], state="readonly", width=10)
facility_combo.grid(row=row, column=1, sticky='w', padx=(4,6), pady=(6,2)); facility_combo.current(2)
row += 1
fac_desc_var = tk.StringVar()
tk.Label(root, textvariable=fac_desc_var, font=("맑은 고딕",8), fg="grey").grid(row=row, column=1, sticky="w", padx=6, pady=(0,6))
row += 1
def update_fac_desc(event=None):
    try:
        text=facility_combo.get(); digits="".join([c for c in text if c.isdigit()])
        num=int(digits) if digits else 3; fac_desc_var.set(FACILITY_DESCRIPTIONS.get(num,""))
    except Exception as e:
        print(f"시설 설명 업데이트 중 오류: {e}")
facility_combo.bind("<<ComboboxSelected>>", update_fac_desc); update_fac_desc()

# === 공실률 행: 시설등급 아래 가로 배치 ===
vacancy_line = tk.Frame(root)
vacancy_line.grid(row=row, column=1, sticky='w', padx=(4,6), pady=(6,2))

# 현재 공실률(%) - 사용자 입력
tk.Label(vacancy_line, text="현재 공실률(%):").pack(side="left")
current_vacancy_var = tk.DoubleVar(value=0.0)
spin_current_vacancy = tk.Spinbox(
    vacancy_line, from_=0.0, to=100.0, increment=0.1, format="%.1f",
    width=6, textvariable=current_vacancy_var
)
spin_current_vacancy.pack(side="left", padx=(4,12))

# 지역별 공실률(%) - KOSIS API 표시 (지역 라벨 + 값 라벨)
tk.Label(vacancy_line, text="지역별 공실률(%):").pack(side="left")
tk.Label(vacancy_line, textvariable=kosis_region_var, font=("맑은 고딕",8)).pack(side="left", padx=(4,4))
tk.Label(vacancy_line, textvariable=kosis_vacancy_text_var, font=("맑은 고딕",8)).pack(side="left", padx=(2,8))

# 새로고침 / 수동 불러오기
ttk.Button(vacancy_line, text="↻", width=2,
           command=lambda: trigger_kosis_autofill(force=True)).pack(side="left", padx=(0,4))
ttk.Button(vacancy_line, text="수동 불러오기",
           command=lambda: open_kosis_api_selector(entry_property_address.get())).pack(side="left")

row += 1
# 설명문(폰트 7)
tk.Label(root, text="KOSIS_ 임대동향 지역별 공실률(중대형상가)",
         font=("맑은 고딕",7), fg="grey")\
  .grid(row=row, column=1, sticky="w", padx=6, pady=(0,6))
row += 1

# (좌측 영역 꼬리) 저작권
tk.Label(root, text="Copyright 2025. CNS Corporation. All rights reserved.",
         font=("맑은 고딕",10)).grid(row=row, column=0, columnspan=2, pady=(0,10))

# ================== 히스토리 유틸 ==================
def generate_uid():
    ts = datetime.datetime.now().strftime("%Y%m%d%H%M%S")
    generate_uid.counter += 1
    return f"{ts}-{generate_uid.counter:03d}"
generate_uid.counter = 0

def save_inputs_store():
    try:
        with open(INPUTS_AUTOSAVE_PATH, "w", encoding="utf-8") as f:
            json.dump(inputs_store, f, ensure_ascii=False, indent=2)
    except Exception as e:
        log_debug(f"[JSON] save fail: {e}")
        messagebox.showerror("오류", f"입력값 저장 실패:\n{e}", parent=root)

def load_inputs_store():
    global inputs_store
    if os.path.exists(INPUTS_AUTOSAVE_PATH):
        try:
            with open(INPUTS_AUTOSAVE_PATH,"r",encoding="utf-8") as f:
                inputs_store = json.load(f)
        except Exception:
            inputs_store = {}
    else:
        inputs_store = {}

def ensure_autosave_header(path):
    try:
        need_header = (not os.path.exists(path)) or os.path.getsize(path) == 0
        if need_header:
            with open(path, "w", newline="", encoding="utf-8-sig") as f:
                writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
                writer.writeheader()
    except Exception as e:
        log_debug(f"[CSV] header ensure fail: {e}")
        messagebox.showerror("저장 오류", f"자동 저장 파일을 만들 수 없습니다.\n{path}\n\n{e}", parent=root)

def append_history_row_to_csv(row_dict):
    try:
        ensure_autosave_header(AUTOSAVE_PATH)
        with open(AUTOSAVE_PATH, "a", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
            writer.writerow({k: row_dict.get(k, "") for k in CSV_FIELDNAMES})
    except Exception as e:
        log_debug(f"[CSV] write fail: {e}")
        messagebox.showerror("저장 오류", f"자동 저장 파일을 쓸 수 없습니다.\n{AUTOSAVE_PATH}\n\n{e}", parent=root)

def rewrite_history_csv():
    try:
        ensure_autosave_header(AUTOSAVE_PATH)
        with open(AUTOSAVE_PATH, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
            writer.writeheader()
            for row in history_rows:
                writer.writerow({k: row.get(k, "") for k in CSV_FIELDNAMES})
    except Exception as e:
        log_debug(f"[CSV] rewrite fail: {e}")
        messagebox.showerror("저장 오류", f"자동 저장 파일을 다시 쓸 수 없습니다.\n{AUTOSAVE_PATH}\n\n{e}", parent=root)

def export_history_csv():
    if not history_rows:
        messagebox.showinfo("알림", "내보낼 히스토리가 없습니다.", parent=root)
        return
    path = filedialog.asksaveasfilename(defaultextension=".csv", filetypes=[("CSV files","*.csv")])
    if not path:
        return
    try:
        with open(path, "w", newline="", encoding="utf-8-sig") as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
            writer.writeheader()
            for row in history_rows:
                writer.writerow({k: row.get(k, "") for k in CSV_FIELDNAMES})
        messagebox.showinfo("완료", f"CSV로 내보냈습니다:\n{path}", parent=root)
    except Exception as e:
        log_debug(f"[CSV] export fail: {e}")
        messagebox.showerror("오류", f"CSV 내보내기 실패:\n{e}", parent=root)

def add_history_row(dt, name, grade, stab_grade, acc_grade, fac_grade,
                    current_value, potential_value, growth_value,
                    base, noi, cap, inputs=None, uid=None):
    uid = uid or generate_uid()

    # Treeview: 선언된 11개 컬럼에 맞춰 11개 값만 넣는다 (base 제외)
    iid = history_tree.insert(
        "", "end",
        values=(dt, name, grade, stab_grade, acc_grade, fac_grade,
                current_value, potential_value, growth_value,
                noi, cap)
    )

    def _to_num(s, default=3):
        try: return int("".join([c for c in s if c.isdigit()]))
        except: return default

    stab_num = _to_num(stab_grade, 2)
    acc_num  = _to_num(acc_grade, 3)
    fac_num  = _to_num(fac_grade, 3)

    # CSV 필드명은 CSV_FIELDNAMES와 동일
    row = {
        "UID": uid,
        "시간": dt,
        "물건명": name,
        "등급": grade,
        "임대안정성": stab_grade,
        "임대안정성설명": STABILITY_DESCRIPTIONS.get(stab_num,""),
        "접근성등급": acc_grade,
        "접근성설명": ACCESSIBILITY_DESCRIPTIONS.get(acc_num,""),
        "시설등급":  fac_grade,
        "시설설명":  FACILITY_DESCRIPTIONS.get(fac_num,""),
        "Market Value": current_value,
        "Value-Add Potential": potential_value,
        "HBU Value": growth_value,
        "NOI": noi,
        "CapRate(%)": cap,
        "_iid": iid,
        "inputs": inputs or {}
    }

    history_rows.append(row)
    append_history_row_to_csv(row)

    if inputs:
        inputs_store[uid] = inputs
        save_inputs_store()

def load_history_from_csv():
    if not os.path.exists(AUTOSAVE_PATH) or os.path.getsize(AUTOSAVE_PATH)==0:
        return
    with open(AUTOSAVE_PATH,"r",newline="",encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            uid  = row.get("UID","")
            dt   = row.get("시간","")
            name = row.get("물건명","")
            grade= row.get("등급","")
            stab = row.get("임대안정성","")
            acc  = row.get("접근성등급","")
            fac  = row.get("시설등급","")

            curr = row.get("Market Value","")
            pot  = row.get("Value-Add Potential","") or row.get("Value-add Potential","")  # 하위호환
            grow = row.get("HBU Value","")
            noi  = row.get("NOI","")
            cap  = row.get("CapRate(%)","")

            iid = history_tree.insert(
                "", "end",
                values=(dt, name, grade, stab, acc, fac, curr, pot, grow, noi, cap)
            )

            row["_iid"] = iid
            row["inputs"] = inputs_store.get(uid, {}) if uid else {}
            history_rows.append(row)

def delete_selected_history():
    sel = history_tree.selection()
    if not sel:
        messagebox.showinfo("알림","삭제할 항목을 선택하세요."); return
    removed = False
    for iid in sel:
        idx = None
        for i,r in enumerate(history_rows):
            if r.get("_iid")==iid:
                uid=r.get("UID");
                if uid and uid in inputs_store: inputs_store.pop(uid,None)
                idx=i; break
        if idx is not None:
            history_rows.pop(idx); removed=True
        history_tree.delete(iid)
    if removed: save_inputs_store(); rewrite_history_csv()

def clear_history():
    if not history_rows: return
    if messagebox.askyesno("확인","히스토리를 모두 삭제할까요?"):
        history_tree.delete(*history_tree.get_children()); history_rows.clear()
        try:
            if os.path.exists(AUTOSAVE_PATH): os.remove(AUTOSAVE_PATH)
            if os.path.exists(INPUTS_AUTOSAVE_PATH): os.remove(INPUTS_AUTOSAVE_PATH)
        except Exception as e:
            messagebox.showerror("오류", f"파일 삭제 실패: {e}")

def on_history_load(event=None):
    sel = history_tree.selection()
    if not sel:
        messagebox.showinfo("알림","불러올 항목을 선택하세요."); return
    iid = sel[0]
    rowdata = next((r for r in history_rows if r.get("_iid")==iid), None)
    if not rowdata:
        messagebox.showerror("오류","선택 항목 데이터를 찾을 수 없습니다."); return
    inputs = rowdata.get("inputs",{})
    if not inputs:
        uid = rowdata.get("UID","")
        if uid and uid in inputs_store:
            inputs = inputs_store.get(uid,{})
            rowdata["inputs"]=inputs
    if not inputs:
        messagebox.showinfo("알림","이 항목에는 저장된 입력값 정보가 없습니다."); return

    def _set(entry,val,is_float=True):
        entry.delete(0,tk.END)
        try:
            if is_float: entry.insert(0, f"{float(val):,.2f}".rstrip('0').rstrip('.'))
            else: entry.insert(0, str(val))
        except: entry.insert(0, str(val))

    # 필드 값 반영
    entry_property_name.delete(0,tk.END); entry_property_name.insert(0, inputs.get("property_name",""))
    entry_property_address.delete(0,tk.END); entry_property_address.insert(0, inputs.get("property_address",""))
    _set(entry_monthly_rent, inputs.get("monthly_rent",0))
    _set(entry_deposit, inputs.get("deposit",0))
    _set(entry_ad_income, inputs.get("ad_income",0))
    _set(entry_parking_income, inputs.get("parking_income",0))
    _set(entry_other_income, inputs.get("other_income",0))
    _set(entry_facility_costs, inputs.get("facility_costs",0))
    _set(entry_management_rate, inputs.get("management_return_rate_pct",0))
    spin_cap_rate.delete(0, tk.END); spin_cap_rate.insert(0, inputs.get("cap_rate_pct",0))

    # 현재 공실률/지역 공실률 복원
    try:
        if "current_vacancy_pct" in inputs:
            current_vacancy_var.set(float(inputs.get("current_vacancy_pct", 0.0)))
            spin_current_vacancy.delete(0, tk.END)
            spin_current_vacancy.insert(0, f"{float(inputs.get('current_vacancy_pct', 0.0)):.1f}")
    except Exception:
        pass
    try:
        vac = float(inputs.get("regional_vacancy_pct", 0.0))
        kosis_vacancy_pct_var.set(vac)
        kosis_vacancy_text_var.set(f"{vac:.1f}%") if vac>0 else kosis_vacancy_text_var.set("N/A")
        kosis_region_var.set(inputs.get("kosis_region_label", ""))
        kosis_period_var.set(inputs.get("kosis_period", ""))
    except Exception:
        kosis_vacancy_pct_var.set(0.0); kosis_vacancy_text_var.set("N/A")
        kosis_region_var.set(""); kosis_period_var.set("")

    # 등급 복원
    def _digits(v):
        try: return int(''.join(ch for ch in str(v) if ch.isdigit()))
        except: return None

    grade_num = inputs.get("grade_num") or _digits(rowdata.get("등급",""))
    stab_num  = inputs.get("stab_num")  or _digits(rowdata.get("임대안정성",""))
    acc_num   = inputs.get("acc_num")   or _digits(rowdata.get("접근성등급",""))
    fac_num   = inputs.get("fac_num")   or _digits(rowdata.get("시설등급",""))

    def _apply_combo(combo, num, fallback_index=0):
        try:
            combo.current(max(0, min(4, int(num)-1)) if num is not None else fallback_index)
        except:
            combo.current(fallback_index)

    _apply_combo(grade_combo, grade_num, 0)
    _apply_combo(stability_combo, stab_num, 1)
    _apply_combo(accessibility_combo, acc_num, 2)
    _apply_combo(facility_combo, fac_num, 2)

    try:
        update_grade_desc(); update_stab_desc(); update_acc_desc(); update_fac_desc()
    except:
        pass

# ================== 우측 결과 히스토리 패널 ==================
history_frame = ttk.LabelFrame(root, text="결과 히스토리")
history_frame.grid(row=0, column=2, rowspan=999, sticky="nswe", padx=(10,8), pady=(2,8))
history_frame.grid_rowconfigure(0, weight=1)
history_frame.grid_columnconfigure(0, weight=1)

cols = ("시간","물건명","입지등급","임대안정성","접근성등급","시설등급",
        "Market Value","Value-Add Potential","HBU Value","NOI","CapRate(%)")

history_tree = ttk.Treeview(history_frame, columns=cols, show="headings", height=26)
# 폭 개수는 컬럼(11개)와 정확히 맞추기
for c, w in zip(cols, (77,150,70,70,70,70, 120,120,120,100,100)):
    history_tree.heading(c, text=c)
    history_tree.column(c, width=w, anchor="center")

history_tree.heading("Market Value", text="Market Value")
history_tree.heading("Value-Add Potential", text="Value-Add Potential")
history_tree.heading("HBU Value", text="HBU Value")

history_tree["displaycolumns"] = ("시간","물건명","입지등급","임대안정성",
                                  "접근성등급","시설등급",
                                  "Market Value","Value-Add Potential","HBU Value",
                                  "NOI","CapRate(%)")

scrollbar = ttk.Scrollbar(history_frame, orient="vertical", command=history_tree.yview)
history_tree.configure(yscrollcommand=scrollbar.set)
history_tree.grid(row=0, column=0, sticky="nsew"); scrollbar.grid(row=0, column=1, sticky="ns")

def build_history_buttons():
    history_btns = ttk.Frame(history_frame)
    history_btns.grid(row=1, column=0, columnspan=2, sticky="ew", pady=(6,0))
    ttk.Button(history_btns, text="Export CSV", command=export_history_csv).grid(row=0, column=0, padx=(0,6))
    ttk.Button(history_btns, text="선택 삭제",   command=delete_selected_history).grid(row=0, column=1, padx=(0,6))
    ttk.Button(history_btns, text="전체 삭제",   command=clear_history).grid(row=0, column=2, padx=(0,6))
    ttk.Button(history_btns, text="선택 불러오기",command=on_history_load).grid(row=0, column=3, padx=(0,6))
build_history_buttons()

def on_history_double_click(event):
    item_id = history_tree.identify_row(event.y)
    if item_id:
        history_tree.selection_set(item_id)
        on_history_load()

history_tree.bind("<Double-1>", on_history_double_click)

# ================== 결과 모달 + PDF ==================
def show_result_dialog_table(payload: dict):
    """
    계산 결과를 상세 모달로 보여주고, 폰트 임베드 선택 + PDF 저장(=인쇄) 지원.
    """
    global _investigator_name, _opinion_text, _last_result_payload, _result_logo_path

    dlg = tk.Toplevel(root)
    dlg.title("상업용 (Retail/office) 부동산 가치 평가 결과")
    dlg.transient(root); dlg.grab_set()
    dlg.geometry("760x700")

    frm = tk.Frame(dlg, padx=14, pady=12)
    frm.pack(fill="both", expand=True)

    # 제목
    tk.Label(frm, text="상업용(Retail/office) 부동산 가치 평가 결과",
             font=("맑은 고딕", 14, "bold")).pack(anchor="w")

    # 상단 로고(선택)
    if _result_logo_path:
        try:
            from PIL import Image, ImageTk
            img = Image.open(_result_logo_path)
            img.thumbnail((400, 120))
            logo_img = ImageTk.PhotoImage(img)
            lbl_logo = tk.Label(frm, image=logo_img)
            lbl_logo.image = logo_img
            lbl_logo.pack(anchor="w", pady=(6, 0))
        except Exception:
            pass

    # 기본 정보
    tk.Label(frm, text=f"물건명: {payload.get('property_name','-')}",
             font=("맑은 고딕", 11), anchor="w").pack(fill="x", pady=(8, 0))
    tk.Label(frm, text=f"주소: {payload.get('property_address','-')}",
             font=("맑은 고딕", 10), anchor="w").pack(fill="x")

    # 요약 표
    table = tk.LabelFrame(frm, text="요약")
    table.pack(fill="x", pady=(10, 10))

    rows = [
        ("입지", payload.get("grade_desc", "")),
        ("임대안정성", payload.get("stab_desc", "")),
        ("접근성", payload.get("acc_desc", "")),
        ("시설", payload.get("fac_desc", "")),
        ("Market Value", payload.get("final_value_text", "-")),
    ]

    tk.Label(table, text="항목", borderwidth=1, relief="solid", width=12, anchor="center").grid(row=0, column=0, sticky="nsew")
    tk.Label(table, text="근거", borderwidth=1, relief="solid", width=70, anchor="center").grid(row=0, column=1, sticky="nsew")

    for i, (label, val) in enumerate(rows, start=1):
        tk.Label(table, text=label, borderwidth=1, relief="solid", anchor="center").grid(row=i, column=0, sticky="nsew")
        tk.Label(table, text=val,   borderwidth=1, relief="solid", anchor="w", justify="left", wraplength=540)\
            .grid(row=i, column=1, sticky="nsew")
    for c in range(2):
        table.grid_columnconfigure(c, weight=1)

    # 조사 담당자
    inv_frame = tk.Frame(frm); inv_frame.pack(fill="x", pady=(6, 2))
    tk.Label(inv_frame, text="조사 담당자:", width=12, anchor="w").pack(side="left")
    inv_var = tk.StringVar(value=_investigator_name)
    tk.Entry(inv_frame, textvariable=inv_var).pack(side="left", fill="x", expand=True, padx=(6, 0))

    # 조사일자 (월/일)
    date_frame = tk.Frame(frm); date_frame.pack(fill="x", pady=(4, 2))
    tk.Label(date_frame, text="조사일자:", width=12, anchor="w").pack(side="left")
    date_month_var = tk.StringVar(); date_day_var = tk.StringVar()
    tk.Entry(date_frame, width=4, textvariable=date_month_var).pack(side="left")
    tk.Label(date_frame, text="월  ").pack(side="left")
    tk.Entry(date_frame, width=4, textvariable=date_day_var).pack(side="left")
    tk.Label(date_frame, text="일").pack(side="left")

    # 확인한 시설 (체크박스들)
    fac_chk_frame = tk.Frame(frm); fac_chk_frame.pack(fill="x", pady=(4, 2))
    tk.Label(fac_chk_frame, text="확인한 시설:", width=12, anchor="w").pack(side="left")
    chkvars = {
        "실외 환경": tk.BooleanVar(),
        "주차/접근로": tk.BooleanVar(),
        "교통/유동/상권": tk.BooleanVar(),
        "실내 환경": tk.BooleanVar(),
        "전기/소방설비": tk.BooleanVar(),
        "수도/배관설비": tk.BooleanVar(),
    }
    for name, var in chkvars.items():
        ttk.Checkbutton(fac_chk_frame, text=name, variable=var).pack(side="left", padx=(2, 6))

    # 확인자
    conf_frame = tk.Frame(frm); conf_frame.pack(fill="x", pady=(4, 6))
    tk.Label(conf_frame, text="확인자:", width=12, anchor="w").pack(side="left")
    confirmer_var = tk.StringVar()
    tk.Entry(conf_frame, textvariable=confirmer_var).pack(side="left", fill="x", expand=True)

    # 의견(자유기술)
    opn_frame = tk.Frame(frm); opn_frame.pack(fill="both", expand=True, pady=(6, 0))
    tk.Label(opn_frame, text="의견:", anchor="w").pack(fill="x")
    opn_text = tk.Text(opn_frame, height=6, wrap="word"); opn_text.pack(fill="both", expand=True)
    opn_text.insert("1.0", _opinion_text or "")

    # 버튼 영역
    btns = tk.Frame(frm); btns.pack(fill="x", pady=(12, 0))
    tk.Button(btns, text="폰트 선택(TTF/OTF 임베드)", command=choose_font).pack(side="left", padx=0)

    # ========= PDF 빌더/저장 =========
    def _build_pdf_a4(path: str, payload: dict):
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.units import mm
        from reportlab.lib import colors
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Image as RLImage, Table, TableStyle, \
            HRFlowable
        from reportlab.lib.enums import TA_CENTER
        from reportlab.pdfbase.pdfmetrics import stringWidth

        PAGE_W, PAGE_H = A4
        top_margin = 20 * mm
        bottom_margin = 30 * mm
        left_margin = 20 * mm
        right_margin = 20 * mm
        usable_w = PAGE_W - left_margin - right_margin

        # 폰트 임베드
        font_name = "Helvetica"
        try:
            font_path = _find_korean_font_path()
            if font_path:
                pdfmetrics.registerFont(TTFont("KRUser", font_path))
                font_name = "KRUser"
        except Exception:
            pass

        BODY_FS = 10
        TITLE_FS = 14
        SLOGAN_FS = 7
        FOOTER_FS = 7
        LEAD_BODY = BODY_FS + 2

        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(name="KBody", fontName=font_name, fontSize=BODY_FS, leading=LEAD_BODY))
        styles.add(ParagraphStyle(name="KBodyCenter", fontName=font_name, fontSize=BODY_FS, leading=LEAD_BODY,
                                  alignment=TA_CENTER))
        styles.add(ParagraphStyle(name="KTitle", fontName=font_name, fontSize=TITLE_FS, leading=TITLE_FS + 3,
                                  alignment=TA_CENTER))

        def fit_one_line(text, max_width_pt, font=font_name, size=BODY_FS):
            t = (text or "").replace("\n", " ").strip()
            if not t:
                return ""
            if stringWidth(t, font, size) <= max_width_pt:
                return t
            ell = " …"
            while t and stringWidth(t + ell, font, size) > max_width_pt:
                t = t[:-1]
            return (t + ell) if t else ""

        # 헤더/푸터
        def on_page(canvas, doc):
            canvas.saveState()
            # 헤더
            canvas.setFont(font_name, SLOGAN_FS)
            y_slogan = PAGE_H - top_margin + 4
            canvas.drawCentredString(PAGE_W / 2.0, y_slogan,
                                     "Tomorrow is here, 바로 지금 끊임없이 성장하는 씨엔에스 주식회사와 함께 하십시오.")
            canvas.setLineWidth(0.6)
            canvas.setStrokeColor(colors.grey)
            y_header_line = PAGE_H - top_margin - 2
            canvas.line(left_margin, y_header_line, PAGE_W - right_margin, y_header_line)
            # 푸터
            addr_y = 8 * mm
            canvas.setFont(font_name, FOOTER_FS)
            canvas.drawCentredString(PAGE_W / 2.0, addr_y,
                                     "광주광역시 서구 죽봉대로 37, 씨엔에스 주식회사 www.cnsinc.co.kr")
            line_y = addr_y + 5 * mm
            canvas.setLineWidth(0.6)
            canvas.setStrokeColor(colors.grey)
            canvas.line(left_margin, line_y, PAGE_W - right_margin, line_y)
            disc1_y = line_y + 6 * mm
            disc2_y = disc1_y + 4.2 * mm
            canvas.setFont(font_name, FOOTER_FS)
            canvas.drawCentredString(PAGE_W / 2.0, disc2_y,
                                     "본 프로그램의 결과치는 당사의 축적된 경험과 다각적인 데이터를 종합하여 도출된 추정 가치입니다.")
            canvas.drawCentredString(PAGE_W / 2.0, disc1_y,
                                     "다만, 이는 참고용 추정치로 실제 거래 결과는 시장 환경과 개별 사정에 따라 변동될 수 있음을 유의하여 주시기바랍니다.")
            canvas.restoreState()

        # ==== flow ====
        flow = []

        # 로고(선택)
        if _result_logo_path:
            try:
                img = RLImage(_result_logo_path)
                img._restrictSize(120 * mm, 28 * mm)
                flow.append(img)
                flow.append(Spacer(1, 6))
            except Exception:
                pass

        # 제목 + 한 줄 띄움
        flow.append(Paragraph("상업용(Retail/office) 부동산 가치 평가 결과", styles["KTitle"]))
        flow.append(Spacer(1, 12))  # 요청: 제목 다음 한 줄

        # 기본 정보
        flow.append(Paragraph(f"물건명: {payload.get('property_name', '-')}", styles["KBody"]))
        flow.append(Paragraph(f"주소: {payload.get('property_address', '-')}", styles["KBody"]))
        flow.append(Spacer(1, 8))

        # 요약 표
        col1_w = 42 * mm
        col2_w = usable_w - col1_w
        desc_grade = fit_one_line(payload.get("grade_desc", ""), col2_w - 2 * mm)
        desc_stab = fit_one_line(payload.get("stab_desc", ""), col2_w - 2 * mm)
        desc_acc = fit_one_line(payload.get("acc_desc", ""), col2_w - 2 * mm)
        desc_fac = fit_one_line(payload.get("fac_desc", ""), col2_w - 2 * mm)
        final_val = fit_one_line(payload.get("final_value_text", ""), col2_w - 2 * mm)

        from reportlab.platypus import Table
        data = [
            ["판단 항목", "판단 근거"],
            ["입지", Paragraph(desc_grade, styles["KBody"])],
            ["임대안정성", Paragraph(desc_stab, styles["KBody"])],
            ["접근성", Paragraph(desc_acc, styles["KBody"])],
            ["시설", Paragraph(desc_fac, styles["KBody"])],
            ["Market-Value", Paragraph(final_val, styles["KBody"])],
        ]
        tbl = Table(data, colWidths=[col1_w, col2_w])
        tbl.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, colors.Color(0.75, 0.75, 0.75)),
            ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.95, 0.95, 0.95)),
            ("ALIGN", (0, 0), (0, 0), "CENTER"),
            ("ALIGN", (1, 0), (1, 0), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("FONTNAME", (0, 0), (-1, -1), font_name),
            ("FONTSIZE", (0, 0), (-1, -1), BODY_FS),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        flow.append(tbl)

        # 조사 담당자/일자/확인 등 간단 구성
        from reportlab.platypus import HRFlowable
        def plain_cell(text, w_pt):
            t = Table([[Paragraph((text or "").strip(), styles["KBody"])]], colWidths=[w_pt])
            t.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (-1, -1), "LEFT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 1.5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1.5),
                ("TOPPADDING", (0, 0), (-1, -1), 1.2),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.2),
                ("FONTNAME", (0, 0), (-1, -1), font_name),
                ("FONTSIZE", (0, 0), (-1, -1), BODY_FS),
            ]))
            return t

        from reportlab.lib.units import mm
        LABEL_W = 22 * mm
        VAL_W = usable_w - LABEL_W
        def two_col(label, content_table):
            t = Table([[Paragraph(label, styles["KBody"]), content_table]], colWidths=[LABEL_W, VAL_W])
            t.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("ALIGN", (0, 0), (0, -1), "RIGHT"),
                ("LEFTPADDING", (0, 0), (-1, -1), 1.5),
                ("RIGHTPADDING", (0, 0), (-1, -1), 1.5),
                ("TOPPADDING", (0, 0), (-1, -1), 1.5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
            ]))
            return t

        inv = (payload.get("investigator") or "").strip()
        dm = (payload.get("date_month") or "").strip()
        dd = (payload.get("date_day") or "").strip()
        fac_list = payload.get("confirm_facilities") or []
        confirmer = (payload.get("confirmer") or "").strip()
        opn = (payload.get("opinion") or "").strip()

        flow.append(two_col("조사 담당자", plain_cell(inv, VAL_W)))
        from reportlab.platypus import Paragraph
        md_tbl = Table([[plain_cell(dm, 12 * mm), Paragraph("월", styles["KBody"]),
                         plain_cell(dd, 12 * mm), Paragraph("일", styles["KBody"])]],
                       colWidths=[12 * mm, 6 * mm, 12 * mm, 6 * mm])
        from reportlab.platypus import TableStyle
        md_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0.5),
        ]))
        flow.append(two_col("조사 일자", md_tbl))
        flow.append(two_col("확인한 시설", plain_cell(", ".join(fac_list), VAL_W)))
        flow.append(two_col("확인자", plain_cell(confirmer, VAL_W)))
        flow.append(HRFlowable(width="100%", thickness=0.4, color=colors.Color(0.82, 0.82, 0.82)))
        flow.append(Paragraph("검토 의견:", styles["KBody"]))
        flow.append(Paragraph(opn.replace("\n", "<br/>"), styles["KBody"]))

        # 문서 빌드
        doc = SimpleDocTemplate(
            path, pagesize=A4,
            leftMargin=20*mm, rightMargin=20*mm,
            topMargin=20*mm + 10*mm, bottomMargin=30*mm
        )
        doc.build(flow, onFirstPage=on_page, onLaterPages=on_page)

    def save_pdf_a4():
        global _investigator_name, _opinion_text, _last_result_payload
        _investigator_name = inv_var.get().strip()
        _opinion_text = opn_text.get("1.0", "end").strip()

        checked_facilities = [name for name, var in chkvars.items() if var.get()]

        pdf_payload = dict(_last_result_payload) if _last_result_payload else {}
        pdf_payload.update({
            "property_name": payload.get("property_name", "-"),
            "property_address": payload.get("property_address", "-"),
            "grade_desc": payload.get("grade_desc", ""),
            "stab_desc": payload.get("stab_desc", ""),
            "acc_desc": payload.get("acc_desc", ""),
            "fac_desc": payload.get("fac_desc", ""),
            "final_value_text": payload.get("final_value_text", "-"),
            "investigator": _investigator_name,
            "opinion": _opinion_text,
            "date_month": date_month_var.get().strip(),
            "date_day": date_day_var.get().strip(),
            "confirm_facilities": checked_facilities,
            "confirmer": confirmer_var.get().strip(),
        })
        _last_result_payload = pdf_payload

        path = filedialog.asksaveasfilename(defaultextension=".pdf",
                                            filetypes=[("PDF", "*.pdf")],
                                            title="A4 PDF로 저장")
        if not path:
            return
        try:
            _build_pdf_a4(path, pdf_payload)
            messagebox.showinfo("완료", f"PDF로 저장되었습니다.\n\n{path}", parent=dlg)
        except ImportError:
            messagebox.showerror("PDF 오류", "필요 패키지가 없습니다.\n\npip install reportlab pillow\n을 먼저 실행해 주세요.", parent=dlg)
        except Exception as e:
            messagebox.showerror("PDF 오류", f"PDF 저장 중 오류: {e}", parent=dlg)

    # 결과창 우측 하단 버튼들
    tk.Button(btns, text="PDF 인쇄", command=save_pdf_a4).pack(side="right")
    tk.Button(btns, text="닫기", command=dlg.destroy).pack(side="right", padx=6)

    dlg.bind("<Control-p>", lambda e: (save_pdf_a4(), "break"))
    dlg.bind("<Escape>", lambda e: dlg.destroy())
    dlg.focus_set()

# ================== 계산/보고서 저장(간략) ==================
def on_calculate():
    try:
        property_name    = entry_property_name.get().strip()
        property_address = entry_property_address.get().strip()
        monthly_rent     = float((entry_monthly_rent.get() or "0").replace(',',''))
        deposit          = float((entry_deposit.get() or "0").replace(',',''))
        ad_income        = float((entry_ad_income.get() or "0").replace(',',''))
        parking_income   = float((entry_parking_income.get() or "0").replace(',',''))
        other_income     = float((entry_other_income.get() or "0").replace(',',''))
        facility_costs   = float((entry_facility_costs.get() or "0").replace(',',''))
        management_return_rate = float((entry_management_rate.get() or "0").replace(',',''))/100.0
        cap_rate         = float(spin_cap_rate.get() or "0")/100.0

        # --- NOI/기본가치 ---
        annual_rent_income = (monthly_rent + ad_income + parking_income + other_income)*12 + (deposit*cap_rate)
        annual_facility_mgmt_income = facility_costs*management_return_rate*12
        noi = annual_rent_income + annual_facility_mgmt_income

        valuation = calculate_property_value(noi, cap_rate)
        if valuation is None:
            messagebox.showerror("오류","매매기준 수익율은 0보다 커야 합니다."); return
        base_value = valuation

        # --- 등급 설명 ---
        digits="".join([c for c in grade_combo.get() if c.isdigit()]); grade_num=int(digits) if digits else 1
        grade_desc=GRADE_DESCRIPTIONS.get(grade_num,"")
        digits="".join([c for c in stability_combo.get() if c.isdigit()]); stab_num=int(digits) if digits else 2
        stab_desc=STABILITY_DESCRIPTIONS.get(stab_num,"")
        digits="".join([c for c in accessibility_combo.get() if c.isdigit()]); acc_num=int(digits) if digits else 3
        acc_desc=ACCESSIBILITY_DESCRIPTIONS.get(acc_num,"")
        digits="".join([c for c in facility_combo.get() if c.isdigit()]); fac_num=int(digits) if digits else 3
        fac_desc=FACILITY_DESCRIPTIONS.get(fac_num,"")

        # --- 현재가치 ---
        loc_f = LOCATION_FACTORS.get(grade_num, 0.0)
        stab_f = STABILITY_FACTORS.get(stab_num, 0.0)
        acc_f  = ACCESS_FACTORS.get(acc_num, 0.0)
        fac_f  = FACILITY_FACTORS.get(fac_num, 0.0)
        total_factor = loc_f + stab_f + acc_f + fac_f
        current_value_num = base_value * (1.0 + total_factor)

        # --- 공실률: 사용자 입력/지역(KOSIS) ---
        try:
            cur_vacancy_pct = float(current_vacancy_var.get() or 0.0)
        except Exception:
            cur_vacancy_pct = 0.0
        regional_vacancy_pct = float(kosis_vacancy_pct_var.get() or 0.0)

        # --- 잠재가치 / 잠재성장가치 ---
        if cap_rate > 0:
            raw_potential = (noi * 0.88) * ((cur_vacancy_pct - regional_vacancy_pct) / 100.0) / cap_rate
        else:
            raw_potential = 0.0

        # 잠재가치가 음수면 0 처리
        potential_value_num = max(0.0, raw_potential)
        growth_value_num = current_value_num + potential_value_num

        current_value_txt   = f"{current_value_num:,.0f}"
        potential_value_txt = f"{potential_value_num:,.0f}"
        growth_value_txt    = f"{growth_value_num:,.0f}"

        payload = {
            "property_name": property_name or "-",
            "property_address": property_address or "-",
            "grade_desc": grade_desc,
            "stab_desc": stab_desc,
            "acc_desc": acc_desc,
            "fac_desc": fac_desc,
            "final_value_text": f"{current_value_num/1_000_000:,.0f} 백만원"
        }
        global _last_result_payload; _last_result_payload = payload.copy()

        # --- KOSIS 라벨/시점 (분리된 변수 사용) ---
        kosis_label  = kosis_region_var.get().strip()
        kosis_period = kosis_period_var.get().strip()

        raw_inputs = {
            "property_name": property_name, "property_address": property_address,
            "monthly_rent": monthly_rent, "deposit": deposit,
            "ad_income": ad_income, "parking_income": parking_income, "other_income": other_income,
            "facility_costs": facility_costs, "management_return_rate_pct": float(entry_management_rate.get() or 0),
            "cap_rate_pct": float(spin_cap_rate.get() or 0),
            "grade_num": grade_num, "stab_num": stab_num, "acc_num": acc_num, "fac_num": fac_num,
            "loc_factor": loc_f, "stab_factor": stab_f, "acc_factor": acc_f, "fac_factor": fac_f,
            "total_factor": total_factor,
            "current_vacancy_pct": cur_vacancy_pct,
            "regional_vacancy_pct": regional_vacancy_pct,
            "kosis_region_label": kosis_label,
            "kosis_period": kosis_period
        }

        add_history_row(
            dt=datetime.datetime.now().strftime("%Y-%m-%d %H:%M"),
            name=property_name or "-", grade=f"{grade_num}등급", stab_grade=f"{stab_num}등급",
            acc_grade=f"{acc_num}등급", fac_grade=f"{fac_num}등급",
            current_value=current_value_txt, potential_value=potential_value_txt, growth_value=growth_value_txt,
            base=f"{base_value:,.0f}", noi=f"{noi:,.0f}", cap=f"{cap_rate*100:.2f}%",
            inputs=raw_inputs
        )

        show_result_dialog_table(payload)

    except ValueError:
        messagebox.showerror("입력 오류","모든 값을 올바르게 입력하세요.")

# 우측 하단 버튼
btn_frame = tk.Frame(history_frame); btn_frame.grid(row=2, column=0, columnspan=2, sticky="e", padx=6, pady=8)
tk.Button(btn_frame, text="RESULT", command=on_calculate).pack(side="left", padx=5)

# 기준금리 최초 조회/히스토리 로드
def load_history_all():
    load_inputs_store(); load_history_from_csv()
load_history_all()

# ================== 메인루프 ==================
if __name__ == "__main__":
    try:
        print("부동산 가치 평가 프로그램을 시작합니다...")
        
        # 프로그램이 강제 종료되지 않도록 보호
        import sys
        import traceback
        
        def handle_exception(exc_type, exc_value, exc_traceback):
            if issubclass(exc_type, KeyboardInterrupt):
                sys.__excepthook__(exc_type, exc_value, exc_traceback)
                return
            print(f"예상치 못한 오류가 발생했습니다: {exc_type.__name__}: {exc_value}")
            print("프로그램을 계속 실행합니다...")
            traceback.print_exception(exc_type, exc_value, exc_traceback)
        
        sys.excepthook = handle_exception
        
        # 메인 루프 실행
        root.mainloop()
        print("프로그램이 정상적으로 종료되었습니다.")
        
    except KeyboardInterrupt:
        print("사용자에 의해 프로그램이 중단되었습니다.")
        try:
            safe_exit()
        except:
            pass
    except Exception as e:
        print(f"치명적 오류가 발생했습니다: {e}")
        import traceback
        traceback.print_exc()
        try:
            safe_exit()
        except:
            pass
