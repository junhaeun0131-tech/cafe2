/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useId, useEffect } from 'react';
import {
  Coffee,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ReceiptText,
  Loader2,
} from 'lucide-react';
import { supabase, isSupabaseConfigured, type OrderRow } from './supabaseClient';

// ==========================================
// 1. 음료 메뉴 및 추가 옵션 데이터 정의
// ==========================================

// 음료 목록 및 기본 가격 (단위: 원)
interface BeverageItem {
  id: string;
  name: string;
  price: number;
}

const BEVERAGE_MENU: BeverageItem[] = [
  { id: 'americano', name: '아메리카노', price: 3500 },
  { id: 'latte', name: '카페라떼', price: 4000 },
  { id: 'mocha', name: '카페모카', price: 4500 },
  { id: 'vanilla-latte', name: '바닐라라떼', price: 4500 },
  { id: 'green-tea-latte', name: '녹차라떼', price: 4500 },
];

// 사이즈 옵션 및 추가 요금 (단위: 원)
interface SizeItem {
  id: 'S' | 'M' | 'L';
  name: string;
  extraPrice: number;
}

const SIZE_OPTIONS: SizeItem[] = [
  { id: 'S', name: 'S', extraPrice: 0 },
  { id: 'M', name: 'M', extraPrice: 500 }, // 기본 선택값
  { id: 'L', name: 'L', extraPrice: 1000 },
];

// 추가 옵션 목록 및 추가 요금 (단위: 원)
interface ExtraOptionItem {
  id: string;
  name: string;
  price: number;
}

const EXTRA_OPTIONS: ExtraOptionItem[] = [
  { id: 'shot', name: '샷 추가', price: 500 },
  { id: 'cream', name: '크림 추가', price: 500 },
  { id: 'syrup', name: '시럽 추가', price: 300 },
  { id: 'decaf', name: '디카페인', price: 0 },
];

// 접수된 주문 기록 인터페이스 (UI 렌더링용)
interface OrderRecord {
  id: string;
  name: string;
  phone: string;
  beverageName: string;
  size: 'S' | 'M' | 'L';
  selectedOptions: string[];
  quantity: number;
  requests: string;
  totalPrice: number;
  orderTime: string;
}

// Supabase OrderRow → 로컬 OrderRecord 변환
function rowToRecord(row: OrderRow): OrderRecord {
  return {
    id: row.id ?? `local-${Date.now()}`,
    name: row.name,
    phone: row.phone,
    beverageName: row.beverage_name,
    size: row.size,
    selectedOptions: row.selected_options ?? [],
    quantity: row.quantity,
    requests: row.requests,
    totalPrice: row.total_price,
    orderTime: row.order_time,
  };
}

export default function App() {
  // 고유 ID 생성을 위한 React useId
  const uniqueFormId = useId();

  // ==========================================
  // 상태(State) 관리
  // ==========================================
  const [customerName, setCustomerName] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [selectedDrinkId, setSelectedDrinkId] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<'S' | 'M' | 'L'>('M'); // 기본값: M
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [quantity, setQuantity] = useState<number>(1); // 기본값: 1
  const [specialRequests, setSpecialRequests] = useState<string>('');

  // 유효성 검사 경고 메시지 상태 (이름 또는 음료 누락 시 표시)
  const [validationError, setValidationError] = useState<string | null>(null);

  // 주문 완료 확인 메시지 상태
  const [orderConfirmation, setOrderConfirmation] = useState<string | null>(null);

  // 최근 주문 접수 내역 (UI 시각화용)
  const [recentOrders, setRecentOrders] = useState<OrderRecord[]>([]);

  // Supabase 관련 상태
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // ==========================================
  // Supabase: 초기 주문 목록 로드 + 실시간 구독
  // ==========================================
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    // 최근 주문 5건 로드
    const fetchOrders = async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('주문 목록 로드 오류:', error.message);
        setDbError('주문 내역을 불러오지 못했습니다.');
        return;
      }

      if (data) {
        setRecentOrders(data.map(rowToRecord));
      }
    };

    fetchOrders();

    // 실시간 구독: orders 테이블에 INSERT 이벤트 발생 시 목록 갱신
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders' },
        (payload) => {
          const newOrder = rowToRecord(payload.new as OrderRow);
          setRecentOrders((prev) => [newOrder, ...prev.slice(0, 4)]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ==========================================
  // 실시간 예상 금액 계산 로직
  // ==========================================
  // 1) 선택된 음료 기본 가격
  const selectedDrink = BEVERAGE_MENU.find((drink) => drink.id === selectedDrinkId);
  const drinkPrice = selectedDrink ? selectedDrink.price : 0;

  // 2) 선택된 사이즈 추가 요금
  const sizeOption = SIZE_OPTIONS.find((s) => s.id === selectedSize);
  const sizePrice = sizeOption ? sizeOption.extraPrice : 0;

  // 3) 선택된 추가 옵션들의 합산 요금
  const optionsPrice = selectedOptions.reduce((acc, optId) => {
    const option = EXTRA_OPTIONS.find((o) => o.id === optId);
    return acc + (option ? option.price : 0);
  }, 0);

  // 4) 1잔당 단가 (음료 미선택 시 0원으로 처리하거나 음료 선택 안내)
  const singleCupPrice = selectedDrink ? drinkPrice + sizePrice + optionsPrice : 0;

  // 5) 수량이 곱해진 총 예상 금액
  const estimatedTotalPrice = singleCupPrice * quantity;

  // ==========================================
  // 이벤트 핸들러: 추가 옵션 체크박스 토글
  // ==========================================
  const handleOptionToggle = (optionId: string) => {
    setSelectedOptions((prev) =>
      prev.includes(optionId)
        ? prev.filter((id) => id !== optionId)
        : [...prev, optionId]
    );
  };

  // ==========================================
  // 이벤트 핸들러: 수량 입력값 변경
  // ==========================================
  const handleQuantityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (isNaN(val)) {
      setQuantity(1);
    } else {
      // 수량 최소 1, 최대 10 유지
      const clampedVal = Math.min(10, Math.max(1, val));
      setQuantity(clampedVal);
    }
  };

  // ==========================================
  // 이벤트 핸들러: 주문하기 버튼 클릭 시
  // ==========================================
  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1) 이름 유효성 검사 (필수)
    if (!customerName.trim()) {
      setValidationError('이름을 입력해주세요');
      setOrderConfirmation(null);
      // 이름 입력칸으로 포커스 이동
      document.getElementById(`${uniqueFormId}-name`)?.focus();
      return;
    }

    // 2) 음료 선택 유효성 검사 (필수)
    if (!selectedDrinkId) {
      setValidationError('음료를 선택해주세요');
      setOrderConfirmation(null);
      // 음료 선택칸으로 포커스 이동
      document.getElementById(`${uniqueFormId}-drink`)?.focus();
      return;
    }

    // 유효성 검사 통과 시 에러 초기화
    setValidationError(null);
    setDbError(null);

    // 선택된 옵션명 텍스트 가공
    const optionNames = selectedOptions.map((optId) => {
      const opt = EXTRA_OPTIONS.find((o) => o.id === optId);
      return opt ? opt.name : '';
    }).filter(Boolean);

    const optionsText = optionNames.length > 0 ? `(${optionNames.join(', ')})` : '';

    // 주문 확인 메시지 포맷 구성:
    // "홍길동님, 카페라떼 M사이즈 (샷 추가) 1잔, 총 5,000원 주문이 접수되었습니다!"
    const drinkName = selectedDrink?.name || '';
    const confirmationMsg = `${customerName.trim()}님, ${drinkName} ${selectedSize}사이즈 ${optionsText ? `${optionsText} ` : ''}${quantity}잔, 총 ${estimatedTotalPrice.toLocaleString()}원 주문이 접수되었습니다!`;

    const orderTime = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // ==========================================
    // Supabase에 주문 저장
    // ==========================================
    if (isSupabaseConfigured && supabase) {
      setIsSubmitting(true);
      const orderRow: OrderRow = {
        name: customerName.trim(),
        phone: phoneNumber.trim(),
        beverage_name: drinkName,
        size: selectedSize,
        selected_options: optionNames,
        quantity,
        requests: specialRequests.trim(),
        total_price: estimatedTotalPrice,
        order_time: orderTime,
      };

      const { error } = await supabase.from('orders').insert([orderRow]);
      setIsSubmitting(false);

      if (error) {
        console.error('주문 저장 오류:', error.message);
        setDbError(`주문 저장에 실패했습니다: ${error.message}`);
        return;
      }
      // 실시간 구독이 자동으로 recentOrders를 업데이트하므로 별도 setState 불필요
    } else {
      // Supabase 미설정 시 로컬 상태만 업데이트
      const newOrder: OrderRecord = {
        id: `ORDER-${Date.now()}`,
        name: customerName.trim(),
        phone: phoneNumber.trim(),
        beverageName: drinkName,
        size: selectedSize,
        selectedOptions: optionNames,
        quantity,
        requests: specialRequests.trim(),
        totalPrice: estimatedTotalPrice,
        orderTime,
      };
      setRecentOrders((prev) => [newOrder, ...prev.slice(0, 4)]);
    }

    // 상태 업데이트
    setOrderConfirmation(confirmationMsg);
  };

  // ==========================================
  // 이벤트 핸들러: 다시 작성 버튼 (초기화)
  // ==========================================
  const handleResetForm = () => {
    setCustomerName('');
    setPhoneNumber('');
    setSelectedDrinkId('');
    setSelectedSize('M'); // 기본값 M
    setSelectedOptions([]);
    setQuantity(1); // 기본값 1
    setSpecialRequests('');
    setValidationError(null);
    setOrderConfirmation(null);
    setDbError(null);
  };

  return (
    <div className="min-h-screen bg-[#faf6f0] text-[#432818] py-8 px-4 font-sans antialiased selection:bg-[#6b4226]/20 selection:text-[#6b4226]">
      {/* 메인 주문서 카드 컨테이너 (최대 너비 520px, 가운데 정렬, 둥근 모서리, 부드러운 그림자) */}
      <main className="max-w-[520px] mx-auto bg-white rounded-2xl shadow-[0_10px_35px_rgba(107,66,38,0.08)] border border-[#ebdcd0] p-6 sm:p-8">
        
        {/* ========================================== */}
        {/* 페이지 상단: 카페 로고 & 브랜딩 영역 */}
        {/* ========================================== */}
        <header className="text-center pb-6 border-b border-[#f3eae1] mb-6">
          {/* 카페 로고: ☕ 이모지 크게 */}
          <div className="text-5xl sm:text-6xl mb-2 select-none transform hover:scale-105 transition-transform duration-200 inline-block" role="img" aria-label="커피 로고">
            ☕
          </div>
          {/* 카페 이름: "바이브 카페" */}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#6b4226] tracking-tight">
            바이브 카페
          </h1>
          {/* 부제: "당신의 하루에 바이브를 더하다" */}
          <p className="text-sm text-[#8c6b53] mt-1.5 font-medium">
            당신의 하루에 바이브를 더하다
          </p>
          {/* Supabase 연결 상태 표시 */}
          {isSupabaseConfigured && (
            <p className="text-[11px] text-[#2e7d32] mt-1 font-medium">
              🟢 실시간 주문 연동 중
            </p>
          )}
        </header>

        {/* 유효성 검사 에러 알림 바 (이름 또는 음료 누락 시 경고) */}
        {validationError && (
          <div
            role="alert"
            className="mb-5 flex items-center gap-2.5 p-3.5 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-sm font-semibold animate-shake"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        {/* DB 오류 알림 바 */}
        {dbError && (
          <div
            role="alert"
            className="mb-5 flex items-center gap-2.5 p-3.5 rounded-lg bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-sm font-semibold"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{dbError}</span>
          </div>
        )}

        {/* ========================================== */}
        {/* 주문서 폼 영역 */}
        {/* ========================================== */}
        <form onSubmit={handleOrderSubmit} noValidate className="space-y-5">
          
          {/* 1. 이름 (필수, text) */}
          <div className="space-y-1.5">
            <label
              htmlFor={`${uniqueFormId}-name`}
              className="block text-sm font-bold text-[#54341e]"
            >
              이름 <span className="text-[#c2410c] text-xs font-bold">(필수)</span>
            </label>
            <input
              id={`${uniqueFormId}-name`}
              name="customerName"
              type="text"
              required
              placeholder="주문자 성함을 입력해주세요"
              value={customerName}
              onChange={(e) => {
                setCustomerName(e.target.value);
                if (validationError === '이름을 입력해주세요') setValidationError(null);
              }}
              className="w-full p-[10px] rounded-[8px] border border-[#d6c7b2] bg-white text-[#432818] placeholder-[#b09e8f] text-sm transition-all focus:border-[#6b4226] focus:ring-2 focus:ring-[#6b4226]/20 focus:outline-none"
            />
          </div>

          {/* 2. 전화번호 (tel) */}
          <div className="space-y-1.5">
            <label
              htmlFor={`${uniqueFormId}-phone`}
              className="block text-sm font-bold text-[#54341e]"
            >
              전화번호
            </label>
            <input
              id={`${uniqueFormId}-phone`}
              name="phoneNumber"
              type="tel"
              placeholder="010-0000-0000"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              className="w-full p-[10px] rounded-[8px] border border-[#d6c7b2] bg-white text-[#432818] placeholder-[#b09e8f] text-sm transition-all focus:border-[#6b4226] focus:ring-2 focus:ring-[#6b4226]/20 focus:outline-none"
            />
          </div>

          {/* 3. 음료 선택 (드롭다운) */}
          <div className="space-y-1.5">
            <label
              htmlFor={`${uniqueFormId}-drink`}
              className="block text-sm font-bold text-[#54341e]"
            >
              음료 선택 <span className="text-[#c2410c] text-xs font-bold">(필수)</span>
            </label>
            <div className="relative">
              <select
                id={`${uniqueFormId}-drink`}
                name="selectedDrink"
                required
                value={selectedDrinkId}
                onChange={(e) => {
                  setSelectedDrinkId(e.target.value);
                  if (validationError === '음료를 선택해주세요') setValidationError(null);
                }}
                className="w-full p-[10px] rounded-[8px] border border-[#d6c7b2] bg-white text-[#432818] text-sm transition-all focus:border-[#6b4226] focus:ring-2 focus:ring-[#6b4226]/20 focus:outline-none appearance-none pr-9 cursor-pointer"
              >
                <option value="">-- 음료를 선택해주세요 --</option>
                {BEVERAGE_MENU.map((beverage) => (
                  <option key={beverage.id} value={beverage.id}>
                    {beverage.name} ({beverage.price.toLocaleString()}원)
                  </option>
                ))}
              </select>
              {/* 셀렉트 드롭다운 화살표 */}
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-[#6b4226]">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* 4. 사이즈 (라디오 버튼, 가로 배치) */}
          <fieldset className="space-y-2">
            <legend className="block text-sm font-bold text-[#54341e]">
              사이즈 선택
            </legend>
            <div className="flex flex-row flex-wrap items-center gap-4 pt-0.5">
              {SIZE_OPTIONS.map((size) => {
                const radioId = `${uniqueFormId}-size-${size.id}`;
                const isSelected = selectedSize === size.id;
                return (
                  <div key={size.id} className="flex items-center">
                    <input
                      id={radioId}
                      name="cupSize"
                      type="radio"
                      value={size.id}
                      checked={isSelected}
                      onChange={() => setSelectedSize(size.id)}
                      className="w-4 h-4 text-[#6b4226] accent-[#6b4226] border-[#d6c7b2] focus:ring-[#6b4226]/30 cursor-pointer"
                    />
                    <label
                      htmlFor={radioId}
                      className={`ml-2 text-sm font-medium cursor-pointer transition-colors ${
                        isSelected ? 'text-[#6b4226] font-bold' : 'text-[#54341e]'
                      }`}
                    >
                      {size.name} {size.extraPrice > 0 ? `(+${size.extraPrice.toLocaleString()}원)` : '(+0원)'}
                      {size.id === 'M' && (
                        <span className="text-[11px] text-[#8c6b53] ml-1">(기본)</span>
                      )}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          {/* 5. 추가 옵션 (체크박스, 가로 배치) */}
          <fieldset className="space-y-2">
            <legend className="block text-sm font-bold text-[#54341e]">
              추가 옵션
            </legend>
            <div className="flex flex-row flex-wrap items-center gap-x-4 gap-y-2 pt-0.5">
              {EXTRA_OPTIONS.map((option) => {
                const checkId = `${uniqueFormId}-opt-${option.id}`;
                const isChecked = selectedOptions.includes(option.id);
                return (
                  <div key={option.id} className="flex items-center">
                    <input
                      id={checkId}
                      name="extraOption"
                      type="checkbox"
                      value={option.id}
                      checked={isChecked}
                      onChange={() => handleOptionToggle(option.id)}
                      className="w-4 h-4 rounded text-[#6b4226] accent-[#6b4226] border-[#d6c7b2] focus:ring-[#6b4226]/30 cursor-pointer"
                    />
                    <label
                      htmlFor={checkId}
                      className={`ml-2 text-sm font-medium cursor-pointer transition-colors ${
                        isChecked ? 'text-[#6b4226] font-bold' : 'text-[#54341e]'
                      }`}
                    >
                      {option.name} {option.price > 0 ? `(+${option.price.toLocaleString()}원)` : '(+0원)'}
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>

          {/* 6. 수량 (number 타입, 최소 1, 최대 10, 기본값 1) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                htmlFor={`${uniqueFormId}-quantity`}
                className="block text-sm font-bold text-[#54341e]"
              >
                수량
              </label>
              <span className="text-xs text-[#8c6b53]">최소 1잔 ~ 최대 10잔</span>
            </div>
            <div className="flex items-center gap-3">
              <input
                id={`${uniqueFormId}-quantity`}
                name="orderQuantity"
                type="number"
                min="1"
                max="10"
                value={quantity}
                onChange={handleQuantityChange}
                className="w-full p-[10px] rounded-[8px] border border-[#d6c7b2] bg-white text-[#432818] text-sm tabular-nums transition-all focus:border-[#6b4226] focus:ring-2 focus:ring-[#6b4226]/20 focus:outline-none"
              />
              {/* 직관적인 +/- 빠른 조절 버튼 */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-lg border border-[#d6c7b2] text-[#6b4226] hover:bg-[#faf6f0] active:bg-[#f0e6da] font-bold text-lg flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="수량 감소"
                >
                  -
                </button>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                  className="w-9 h-9 rounded-lg border border-[#d6c7b2] text-[#6b4226] hover:bg-[#faf6f0] active:bg-[#f0e6da] font-bold text-lg flex items-center justify-center transition-colors cursor-pointer"
                  aria-label="수량 증가"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* 7. 요청사항 (textarea) */}
          <div className="space-y-1.5">
            <label
              htmlFor={`${uniqueFormId}-requests`}
              className="block text-sm font-bold text-[#54341e]"
            >
              요청사항
            </label>
            <textarea
              id={`${uniqueFormId}-requests`}
              name="specialRequests"
              rows={3}
              placeholder="얼음 적게, 시럽 반만 등 요청사항을 자유롭게 입력해주세요."
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              className="w-full p-[10px] rounded-[8px] border border-[#d6c7b2] bg-white text-[#432818] placeholder-[#b09e8f] text-sm resize-none transition-all focus:border-[#6b4226] focus:ring-2 focus:ring-[#6b4226]/20 focus:outline-none"
            />
          </div>

          {/* ========================================== */}
          {/* 실시간 예상 금액 표시 영역 */}
          {/* (주문하기 버튼 바로 위에 큰 글씨 24px, 갈색, 굵게, 가운데 정렬) */}
          {/* ========================================== */}
          <div className="pt-3 pb-1 border-t border-[#f3eae1] text-center">
            <div className="text-[24px] font-bold text-[#6b4226] tracking-tight tabular-nums">
              예상 금액: {estimatedTotalPrice.toLocaleString()}원
            </div>
            {!selectedDrinkId && (
              <p className="text-xs text-[#a08470] mt-1">
                * 상단에서 음료를 선택하시면 옵션이 반영된 최종 금액이 계산됩니다.
              </p>
            )}
            {selectedDrink && (
              <p className="text-xs text-[#8c6b53] mt-1 tabular-nums">
                ({selectedDrink.name} {selectedDrink.price.toLocaleString()}원
                {sizePrice > 0 ? ` + 사이즈 ${sizePrice.toLocaleString()}원` : ''}
                {optionsPrice > 0 ? ` + 옵션 ${optionsPrice.toLocaleString()}원` : ''})
                {quantity > 1 ? ` × ${quantity}잔` : ''}
              </p>
            )}
          </div>

          {/* ========================================== */}
          {/* 버튼 영역: 8. 주문하기 버튼 & 9. 다시 작성 버튼 */}
          {/* ========================================== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* 8. 주문하기 버튼: 갈색 배경(#6b4226), 흰색 글씨, hover시 약간 밝게 */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-6 rounded-[8px] bg-[#6b4226] text-white font-bold text-base hover:bg-[#7e4f30] active:scale-[0.99] shadow-sm transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer order-1 sm:order-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>접수 중...</span>
                </>
              ) : (
                <>
                  <Coffee className="w-5 h-5" />
                  <span>주문하기</span>
                </>
              )}
            </button>

            {/* 9. 다시 작성 버튼: 모든 입력과 금액 초기화 */}
            <button
              type="button"
              onClick={handleResetForm}
              className="w-full py-3 px-6 rounded-[8px] bg-[#f0e6da] text-[#6b4226] font-semibold text-base hover:bg-[#e4d6c6] active:scale-[0.99] border border-[#d6c7b2] transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer order-2 sm:order-1"
            >
              <RotateCcw className="w-4 h-4" />
              <span>다시 작성</span>
            </button>
          </div>
        </form>

        {/* ========================================== */}
        {/* 주문 확인 메시지 (성공 시 표시) */}
        {/* (연두색 배경, 초록 글씨, 둥근 모서리) */}
        {/* ========================================== */}
        {orderConfirmation && (
          <section
            aria-live="polite"
            className="mt-6 p-4 rounded-[8px] bg-[#e8f5e9] text-[#2e7d32] border border-[#c8e6c9] shadow-sm transition-all animate-fadeIn"
          >
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#2e7d32] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-sm font-bold text-[#1b5e20] mb-1">주문이 성공적으로 접수되었습니다!</h2>
                <p className="text-sm font-medium leading-relaxed">
                  {orderConfirmation}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 최근 주문 내역 미니 피드 (사용자가 접수한 주문들을 즉시 확인) */}
        {recentOrders.length > 0 && (
          <section className="mt-8 pt-6 border-t border-[#f3eae1]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-[#8c6b53] uppercase tracking-wider flex items-center gap-1.5">
                <ReceiptText className="w-3.5 h-3.5 text-[#6b4226]" />
                접수된 주문 내역 ({recentOrders.length}건)
              </h3>
              <span className="text-[11px] text-[#a08470]">최근 접수순</span>
            </div>
            <div className="space-y-2.5">
              {recentOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="p-3 rounded-lg bg-[#faf6f0] border border-[#ebdcd0] text-xs text-[#54341e] space-y-1"
                >
                  <div className="flex items-center justify-between font-bold text-[#6b4226]">
                    <span>{ord.name} 고객님</span>
                    <span className="tabular-nums">{ord.totalPrice.toLocaleString()}원</span>
                  </div>
                  <div className="text-[#6b4226]/90">
                    {ord.beverageName} ({ord.size}사이즈)
                    {ord.selectedOptions.length > 0 ? ` + ${ord.selectedOptions.join(', ')}` : ''} · {ord.quantity}잔
                  </div>
                  {ord.requests && (
                    <div className="text-[11px] text-[#8c6b53] bg-white/70 p-1.5 rounded">
                      요청사항: {ord.requests}
                    </div>
                  )}
                  <div className="text-[10px] text-[#a08470] text-right">
                    접수시간: {ord.orderTime}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      {/* 페이지 하단 조용한 푸터 */}
      <footer className="max-w-[520px] mx-auto text-center mt-6 text-xs text-[#8c6b53] space-y-1">
        <p>© 바이브 카페 (Vibe Cafe). All rights reserved.</p>
        <p className="text-[11px] text-[#a08470]">따뜻한 커피와 편안한 공간을 선물합니다.</p>
      </footer>
    </div>
  );
}
