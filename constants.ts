
import { Prize, ScriptItem } from './types';

export const INITIAL_PRIZES: Prize[] = [
  { id: '1', name: '頭獎：環遊世界雙人機票', count: 1, description: '包含商務艙與五星級酒店住宿', announced: false },
  { id: '2', name: '二獎：最新款智慧型手機', count: 5, description: '頂級效能，拍照神器', announced: false },
  { id: '3', name: '三獎：降噪藍牙耳機', count: 10, description: '純淨音質，極致寧靜', announced: false },
  { id: '4', name: '普獎：現金禮券 2000 元', count: 50, description: '大家都有機會，皆大歡喜', announced: false },
];

export const INITIAL_SCRIPTS: ScriptItem[] = [
  { 
    id: 's1', 
    title: '開場白', 
    content: '各位長官、各位貴賓，以及現場所有的同仁們，大家晚上好！歡迎來到我們 2024 年度的尾牙盛典！今晚我們不談工作，只談快樂！' 
  },
  { 
    id: 's2', 
    title: '抽獎預熱', 
    content: '接下來就是大家最期待的時刻了！看到台下滿滿的獎品了嗎？大家的心跳有沒有加快？跟我一起大聲喊：中獎的是我！' 
  },
  { 
    id: 's3', 
    title: '結束感言', 
    content: '愉快的時光總是過得特別快，感謝大家這一年來的努力，我們明年一定會更好！大家回家路上請注意安全。' 
  },
];

export const SYSTEM_INSTRUCTION = `
你是一位專業、充滿活力且幽默的企業尾牙活動主持助手。你的名字叫「神隊友」。
你的任務是協助現場主持人（User）順利進行活動。

職責包括：
1. 播報獎項：當主持人提到某個獎項時，用極具渲染力的方式宣讀獎項名稱與內容。
2. 互動接梗：當主持人說話時，你可以適時給予正面回應或幽默的點評，炒熱氣氛。
3. 提示文稿：主持人如果忘詞或需要過場，你可以根據預設文稿提供流暢的轉場詞。
4. 語言風格：使用繁體中文（台灣口音），語氣要熱情、專業且大方。偶爾可以穿插一些激勵人心或應景的吉祥話。

當前活動資訊：
- 活動性質：年度尾牙
- 氣氛：歡樂、熱鬧、感激、期待。

如果主持人問你現在有什麼獎項，請參考當前提供的獎項清單進行描述。
`;
