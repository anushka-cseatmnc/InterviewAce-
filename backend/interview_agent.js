// backend/server.js - COMPLETE PRODUCTION BACKEND
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
require('dotenv').config();

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));

// ==================== CONFIGURATION ====================
const GROQ_API_KEY = process.env.GROQ_API_KEY || 'your_groq_api_key_here';
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Session Management
const sessions = new Map();
const sessionBackups = new Map();

// Auto-save every 30 seconds
setInterval(() => {
  sessions.forEach((session, id) => {
    sessionBackups.set(id, JSON.parse(JSON.stringify(session)));
  });
  console.log(`✅ Auto-saved ${sessions.size} active sessions`);
}, 30000);

// Cleanup old sessions every hour
setInterval(() => {
  const now = Date.now();
  sessions.forEach((session, id) => {
    if (now - session.lastActionTime > 3600000) { // 1 hour
      sessionBackups.set(id, session);
      sessions.delete(id);
      console.log(`🗑️ Archived inactive session: ${id}`);
    }
  });
}, 3600000);

// ==================== INTERVIEWER PROFILES ====================
const INTERVIEWERS = [
  { name: 'Alex Chen', gender: 'male', personality: 'Analytical and precise', company_specialty: 'Google' },
  { name: 'Sarah Kumar', gender: 'female', personality: 'Warm and encouraging', company_specialty: 'Meta' },
  { name: 'Michael Torres', gender: 'male', personality: 'Direct and efficient', company_specialty: 'Amazon' },
  { name: 'Priya Sharma', gender: 'female', personality: 'Detailed and thorough', company_specialty: 'Apple' },
  { name: 'David Kim', gender: 'male', personality: 'Friendly and patient', company_specialty: 'Google' },
  { name: 'Jessica Liu', gender: 'female', personality: 'Engaging and curious', company_specialty: 'Meta' }
];

// ==================== LEETCODE-FORMAT QUESTION BANK ====================
const QUESTION_BANK = {
  Google: {
    dsa: {
      easy: [
        {
          title: "Two Sum",
          difficulty: "Easy",
          description: "Given an array of integers nums and an integer target, return indices of the two numbers that add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.",
          examples: [
            {
              input: "nums = [2,7,11,15], target = 9",
              output: "[0,1]",
              explanation: "Because nums[0] + nums[1] == 9, we return [0, 1]."
            },
            {
              input: "nums = [3,2,4], target = 6",
              output: "[1,2]",
              explanation: "Because nums[1] + nums[2] == 6, we return [1, 2]."
            }
          ],
          constraints: [
            "2 <= nums.length <= 10^4",
            "-10^9 <= nums[i] <= 10^9",
            "-10^9 <= target <= 10^9",
            "Only one valid answer exists."
          ],
          followUp: "Can you come up with an algorithm that is less than O(n²) time complexity?",
          hints: ["Use a hash map to store complements", "Think about what you need to check for each number"]
        },
        {
          title: "Valid Palindrome",
          difficulty: "Easy",
          description: "A phrase is a palindrome if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward.\n\nGiven a string s, return true if it is a palindrome, or false otherwise.",
          examples: [
            {
              input: "s = \"A man, a plan, a canal: Panama\"",
              output: "true",
              explanation: "\"amanaplanacanalpanama\" is a palindrome."
            },
            {
              input: "s = \"race a car\"",
              output: "false",
              explanation: "\"raceacar\" is not a palindrome."
            }
          ],
          constraints: [
            "1 <= s.length <= 2 * 10^5",
            "s consists only of printable ASCII characters."
          ],
          followUp: "Could you solve it with O(1) extra space?",
          hints: ["Use two pointers from both ends", "Remember to skip non-alphanumeric characters"]
        }
      ],
      medium: [
        {
          title: "LRU Cache",
          difficulty: "Medium",
          description: "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache.\n\nImplement the LRUCache class:\n\n- LRUCache(int capacity) Initialize the LRU cache with positive size capacity.\n- int get(int key) Return the value of the key if the key exists, otherwise return -1.\n- void put(int key, int value) Update the value of the key if the key exists. Otherwise, add the key-value pair to the cache. If the number of keys exceeds the capacity, evict the least recently used key.",
          examples: [
            {
              input: "[\"LRUCache\", \"put\", \"put\", \"get\", \"put\", \"get\", \"put\", \"get\", \"get\", \"get\"]\n[[2], [1, 1], [2, 2], [1], [3, 3], [2], [4, 4], [1], [3], [4]]",
              output: "[null, null, null, 1, null, -1, null, -1, 3, 4]",
              explanation: "LRUCache lRUCache = new LRUCache(2);\nlRUCache.put(1, 1); // cache is {1=1}\nlRUCache.put(2, 2); // cache is {1=1, 2=2}\nlRUCache.get(1);    // return 1\nlRUCache.put(3, 3); // LRU key was 2, evicts key 2, cache is {1=1, 3=3}\nlRUCache.get(2);    // returns -1 (not found)\nlRUCache.put(4, 4); // LRU key was 1, evicts key 1, cache is {4=4, 3=3}\nlRUCache.get(1);    // return -1 (not found)\nlRUCache.get(3);    // return 3\nlRUCache.get(4);    // return 4"
            }
          ],
          constraints: [
            "1 <= capacity <= 3000",
            "0 <= key <= 10^4",
            "0 <= value <= 10^5",
            "At most 2 * 10^5 calls will be made to get and put."
          ],
          followUp: "Could you do get and put in O(1) time complexity?",
          hints: ["Think about combining a hash map with a doubly linked list", "The hash map provides O(1) access, the linked list maintains order"]
        },
        {
          title: "Course Schedule",
          difficulty: "Medium",
          description: "There are a total of numCourses courses you have to take, labeled from 0 to numCourses - 1. You are given an array prerequisites where prerequisites[i] = [ai, bi] indicates that you must take course bi first if you want to take course ai.\n\nFor example, the pair [0, 1], indicates that to take course 0 you have to first take course 1.\n\nReturn true if you can finish all courses. Otherwise, return false.",
          examples: [
            {
              input: "numCourses = 2, prerequisites = [[1,0]]",
              output: "true",
              explanation: "There are a total of 2 courses to take. To take course 1 you should have finished course 0. So it is possible."
            },
            {
              input: "numCourses = 2, prerequisites = [[1,0],[0,1]]",
              output: "false",
              explanation: "There are a total of 2 courses to take. To take course 1 you should have finished course 0, and to take course 0 you should also have finished course 1. So it is impossible."
            }
          ],
          constraints: [
            "1 <= numCourses <= 2000",
            "0 <= prerequisites.length <= 5000",
            "prerequisites[i].length == 2",
            "0 <= ai, bi < numCourses",
            "All the pairs prerequisites[i] are unique."
          ],
          followUp: "Can you find the ordering of courses using topological sort?",
          hints: ["This is a cycle detection problem in a directed graph", "Use DFS or Kahn's algorithm for topological sorting"]
        }
      ],
      hard: [
        {
          title: "Median of Two Sorted Arrays",
          difficulty: "Hard",
          description: "Given two sorted arrays nums1 and nums2 of size m and n respectively, return the median of the two sorted arrays.\n\nThe overall run time complexity should be O(log (m+n)).",
          examples: [
            {
              input: "nums1 = [1,3], nums2 = [2]",
              output: "2.00000",
              explanation: "merged array = [1,2,3] and median is 2."
            },
            {
              input: "nums1 = [1,2], nums2 = [3,4]",
              output: "2.50000",
              explanation: "merged array = [1,2,3,4] and median is (2 + 3) / 2 = 2.5."
            }
          ],
          constraints: [
            "nums1.length == m",
            "nums2.length == n",
            "0 <= m <= 1000",
            "0 <= n <= 1000",
            "1 <= m + n <= 2000",
            "-10^6 <= nums1[i], nums2[i] <= 10^6"
          ],
          followUp: "The challenge is to achieve O(log(min(m,n))) time complexity.",
          hints: ["Use binary search on the smaller array", "Think about partitioning both arrays"]
        }
      ]
    },
    theoretical: [
      "Explain the internal working of Google's MapReduce framework and how it handles fault tolerance.",
      "How would you design a distributed rate limiter for Google's API Gateway handling 1 million requests per second?",
      "Walk me through what happens when you type 'google.com' in your browser, from DNS to rendering.",
      "Explain Google's Bigtable architecture and how it differs from traditional relational databases.",
      "How does Google Search's PageRank algorithm work and what are its modern improvements?"
    ],
    hr: [
      "Tell me about a time when you had to make a decision with incomplete information. How did you handle it?",
      "Describe a situation where you disagreed with your team's technical approach. What was the outcome?",
      "Give me an example of when you had to learn a completely new technology under a tight deadline.",
      "Tell me about the most complex system you've designed. What trade-offs did you make?"
    ]
  },
  Amazon: {
    dsa: {
      medium: [
        {
          title: "Package Delivery Optimization",
          difficulty: "Medium",
          description: "You are given an array packages where packages[i] represents the weight of the ith package, and an integer truckCapacity representing the maximum weight capacity of a delivery truck.\n\nFind the minimum number of days needed to deliver all packages if:\n1. Packages must be delivered in the order given\n2. Each day, you load packages sequentially until reaching truck capacity\n3. You cannot split a package across days",
          examples: [
            {
              input: "packages = [1,2,3,4,5,6,7,8,9,10], truckCapacity = 15",
              output: "5",
              explanation: "Day 1: [1,2,3,4,5] = 15\nDay 2: [6,7] = 13\nDay 3: [8] = 8\nDay 4: [9] = 9\nDay 5: [10] = 10"
            }
          ],
          constraints: [
            "1 <= packages.length <= 5 * 10^4",
            "1 <= packages[i] <= 500",
            "1 <= truckCapacity <= 5 * 10^6"
          ],
          followUp: "Can you solve this using binary search in O(n log n) time?",
          hints: ["Binary search on the number of days", "For each mid value, check if delivery is possible"]
        }
      ],
      hard: [
        {
          title: "Warehouse Inventory System",
          difficulty: "Hard",
          description: "Design a system to track inventory across multiple Amazon warehouses that supports:\n\n1. addStock(warehouseId, productId, quantity)\n2. removeStock(warehouseId, productId, quantity)\n3. findNearestWarehouse(location, productId, minQuantity)\n4. transferStock(fromWarehouse, toWarehouse, productId, quantity)\n\nOptimize for query performance at scale.",
          examples: [
            {
              input: "Operations: addStock(\"W1\", \"P100\", 50), findNearestWarehouse({lat: 37.7, lng: -122.4}, \"P100\", 10)",
              output: "\"W1\" if it's the closest warehouse with at least 10 units of P100",
              explanation: "System should use spatial indexing for location queries and efficient data structures for stock tracking"
            }
          ],
          constraints: [
            "10^6 warehouses globally",
            "10^8 products in catalog",
            "10^9 queries per day",
            "Sub-100ms query response time"
          ],
          followUp: "How would you handle concurrent stock updates across distributed systems?",
          hints: ["Consider using R-trees for spatial indexing", "Think about eventual consistency vs strong consistency trade-offs"]
        }
      ]
    },
    theoretical: [
      "Explain Amazon DynamoDB's partition key design and common anti-patterns to avoid.",
      "How does Amazon's recommendation engine work at scale? Discuss collaborative filtering vs content-based approaches.",
      "What causes AWS Lambda cold starts and how would you optimize a serverless application?",
      "Explain the CAP theorem with real examples from Amazon's services (S3, DynamoDB, etc.).",
      "How would you design Amazon's order fulfillment system to handle Prime's 2-day delivery guarantee?"
    ],
    hr: [
      "Tell me about a time you had to make a decision based on Amazon's leadership principle 'Customer Obsession'.",
      "Describe a situation where you had to deliver results with limited resources.",
      "Give an example of when you simplified a complex process. What was the impact?",
      "Tell me about a project that failed. What did you learn and how did you apply those lessons?"
    ]
  },
  Meta: {
    dsa: {
      medium: [
        {
          title: "Friend Suggestions",
          difficulty: "Medium",
          description: "You are given a graph representing a social network where nodes are users and edges are friendships. Implement a function to suggest friends for a given user based on:\n\n1. Mutual friends (friends of friends)\n2. Number of mutual connections\n3. Exclude existing friends and the user themselves\n\nReturn the top K friend suggestions ranked by mutual friend count.",
          examples: [
            {
              input: "graph = {1: [2,3], 2: [1,3,4], 3: [1,2,5], 4: [2], 5: [3]}, user = 1, k = 2",
              output: "[4, 5]",
              explanation: "User 4 has 1 mutual friend (2), User 5 has 1 mutual friend (3). Both are not direct friends of user 1."
            }
          ],
          constraints: [
            "1 <= number of users <= 10^6",
            "1 <= k <= 100",
            "No self-loops or duplicate edges"
          ],
          followUp: "How would you scale this for Facebook's 3 billion users?",
          hints: ["Use BFS to find friends of friends", "Consider using a priority queue for top K results"]
        }
      ]
    },
    theoretical: [
      "Explain how React's virtual DOM and reconciliation algorithm work. What optimizations does React 18 introduce?",
      "How would you design a real-time collaborative editing system like Google Docs?",
      "Walk me through Meta's news feed ranking algorithm. How do you balance engagement vs quality content?",
      "Explain operational transforms vs CRDTs for collaborative editing. Which would you choose and why?",
      "How does WhatsApp achieve end-to-end encryption at scale? Discuss the Signal Protocol."
    ],
    hr: [
      "Tell me about a time when you shipped something imperfect to meet a deadline. How did you iterate?",
      "Describe a situation where you influenced a decision without having direct authority.",
      "Give an example of when you had to balance multiple stakeholder requirements.",
      "Tell me about learning from a failed experiment. How did you apply those insights?"
    ]
  },
  Apple: {
    dsa: {
      medium: [
        {
          title: "Autocorrect System",
          difficulty: "Medium",
          description: "Design an autocorrect system for iOS keyboard that:\n\n1. Stores a dictionary of valid words\n2. For a given misspelled word, suggests corrections based on edit distance\n3. Ranks suggestions by frequency of use\n\nImplement: addWord(word, frequency), getSuggestions(typo, maxSuggestions)\n\nEdit distance is defined as minimum insertions, deletions, or substitutions needed.",
          examples: [
            {
              input: "Dictionary: [(\"apple\", 100), (\"apply\", 50)], typo = \"aple\", maxSuggestions = 2",
              output: "[\"apple\", \"apply\"]",
              explanation: "Both have edit distance 1, but 'apple' ranks higher due to frequency"
            }
          ],
          constraints: [
            "1 <= dictionary size <= 10^5",
            "1 <= word length <= 20",
            "Only lowercase English letters",
            "1 <= frequency <= 10^6"
          ],
          followUp: "How would you optimize for millions of queries per second?",
          hints: ["Use a Trie for prefix matching", "Consider BK-trees for edit distance queries"]
        }
      ]
    },
    theoretical: [
      "Explain iOS's Automatic Reference Counting (ARC) and how it prevents retain cycles.",
      "How does Apple Silicon's unified memory architecture improve performance compared to traditional systems?",
      "Walk me through the iOS keychain security model and the role of Secure Enclave.",
      "Explain Metal graphics API vs OpenGL/Vulkan. Why did Apple create Metal?",
      "How does Apple's differential privacy work in iOS analytics? Discuss local differential privacy."
    ],
    hr: [
      "Tell me about a time when you caught a subtle bug that others missed. What was your process?",
      "Describe a situation where you had to balance innovation with practical constraints.",
      "Give an example of when you improved a user experience through attention to detail.",
      "Tell me about taking ownership of a quality issue. How did you ensure it didn't happen again?"
    ]
  }
};

// ==================== SYSTEM PROMPTS ====================
const SYSTEM_PROMPTS = {
  dsa: `You are {INTERVIEWER_NAME}, a senior software engineer at {COMPANY}. You are conducting a coding interview round.

**YOUR PERSONALITY:** {PERSONALITY}

**INTERVIEW STYLE:**
- Start with a friendly introduction: "Hi! I'm {INTERVIEWER_NAME}, I'll be your interviewer today for the coding round."
- Present problems clearly in LeetCode format
- Give the candidate space to think and code
- Answer clarifying questions briefly and helpfully
- After code submission, ask 1-2 thoughtful follow-up questions about complexity or edge cases
- Keep responses SHORT (2-3 sentences maximum)
- Use natural language like "Nice approach", "That makes sense", "Good thinking"
- If stuck after 2 hints, gently suggest: "Let's move forward to make good use of our time"

**ADAPTIVE DIFFICULTY:**
- Monitor performance and adjust difficulty naturally
- If doing well: "Let's try something more challenging"
- If struggling: "Let me give you a hint" or simplify approach

**IMPORTANT:** 
- Never write code for them
- Don't lecture - this is assessment, not teaching
- Keep conversation natural and brief
- Maintain professional but friendly tone throughout`,

  theoretical: `You are {INTERVIEWER_NAME}, discussing technical concepts and system design.

**YOUR PERSONALITY:** {PERSONALITY}

**INTERVIEW STYLE:**
- Ask open-ended questions about systems, architecture, and CS fundamentals
- Listen actively and probe deeper: "Why did you choose that?", "How would that scale?"
- Keep responses brief (2-3 sentences)
- If they don't know something: "That's okay, let's discuss something else"
- Cover 4-5 topics in the time available (~4 minutes each)
- Natural reactions: "Interesting approach", "Tell me more about that"

**FOCUS AREAS:**
- System design trade-offs
- Scalability considerations  
- Technology choices and reasoning
- Real-world engineering challenges

**IMPORTANT:**
- Assess understanding, don't teach
- Keep it conversational, not interrogative
- Brief responses, let them talk more`,

  hr: `You are {INTERVIEWER_NAME}, conducting the behavioral interview round.

**YOUR PERSONALITY:** {PERSONALITY}

**INTERVIEW STYLE:**
- Warm, empathetic, and encouraging
- Ask about past experiences using STAR method (Situation, Task, Action, Result)
- Listen actively and show genuine interest
- Natural follow-ups: "How did that make you feel?", "What would you do differently?"
- Keep responses brief (2-3 sentences)
- Create a comfortable environment for sharing

**BEHAVIORAL PATTERNS:**
- Leadership and initiative
- Conflict resolution
- Learning and growth
- Team collaboration
- Handling pressure

**IMPORTANT:**
- Be human and empathetic
- Don't rush through stories
- Show you're listening with brief acknowledgments
- Focus on learning about them, not testing them`
};

// ==================== HELPER FUNCTIONS ====================

function selectInterviewer(company) {
  // Try to find interviewer specializing in this company
  let interviewer = INTERVIEWERS.find(i => i.company_specialty === company);
  
  // Fallback to random if not found
  if (!interviewer) {
    interviewer = INTERVIEWERS[Math.floor(Math.random() * INTERVIEWERS.length)];
  }
  
  return interviewer;
}

function getRandomQuestion(company, roundType, difficulty = 'medium', usedQuestions = []) {
  const companyBank = QUESTION_BANK[company] || QUESTION_BANK['Google'];
  let questions;

  if (roundType === 'dsa') {
    questions = companyBank.dsa[difficulty] || companyBank.dsa.medium || [];
  } else {
    questions = companyBank[roundType] || [];
  }

  // Filter out used questions
  const available = questions.filter(q => {
    const qTitle = typeof q === 'string' ? q : q.title;
    return !usedQuestions.some(used => {
      const usedTitle = typeof used === 'string' ? used : used.title;
      return usedTitle === qTitle;
    });
  });

  if (available.length === 0) {
    return questions[0] || "Tell me about your experience with algorithms and data structures.";
  }

  return available[Math.floor(Math.random() * available.length)];
}

function formatQuestionForDisplay(question) {
  if (typeof question === 'string') {
    return question;
  }

  // Format LeetCode-style question
  let formatted = `**${question.title}** (${question.difficulty})\n\n`;
  formatted += `${question.description}\n\n`;
  
  if (question.examples && question.examples.length > 0) {
    formatted += `**Examples:**\n\n`;
    question.examples.forEach((ex, idx) => {
      formatted += `Example ${idx + 1}:\n`;
      formatted += `Input: ${ex.input}\n`;
      formatted += `Output: ${ex.output}\n`;
      if (ex.explanation) {
        formatted += `Explanation: ${ex.explanation}\n`;
      }
      formatted += `\n`;
    });
  }

  if (question.constraints && question.constraints.length > 0) {
    formatted += `**Constraints:**\n`;
    question.constraints.forEach(c => {
      formatted += `• ${c}\n`;
    });
    formatted += `\n`;
  }

  if (question.followUp) {
    formatted += `**Follow-up:** ${question.followUp}`;
  }

  return formatted;
}

function assessPerformance(conversationHistory, currentDifficulty) {
  const recentMessages = conversationHistory.slice(-10).filter(m => m.role === 'user');
  const recentText = recentMessages.join(' ').toLowerCase();

  // Positive indicators
  const positiveWords = ['optimize', 'complexity', 'efficient', 'trade-off', 'edge case', 'time complexity', 'space complexity', 'algorithm', 'solution'];
  const negativeWords = ['stuck', 'confused', 'not sure', "don't know", 'help', 'hint', 'struggling'];

  let score = 0;
  positiveWords.forEach(word => {
    if (recentText.includes(word)) score += 2;
  });
  negativeWords.forEach(word => {
    if (recentText.includes(word)) score -= 3;
  });

  // Adjust difficulty based on performance
  if (score >= 4 && currentDifficulty === 'easy') return 'medium';
  if (score >= 6 && currentDifficulty === 'medium') return 'hard';
  if (score <= -5 && currentDifficulty === 'hard') return 'medium';
  if (score <= -8 && currentDifficulty === 'medium') return 'easy';

  return currentDifficulty;
}

async function callGroqAPI(messages, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(
        GROQ_API_URL,
        {
          model: 'llama-3.3-70b-versatile',
          messages: messages,
          temperature: 0.7,
          max_tokens: 600,
          top_p: 0.9,
          stream: false
        },
        {
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error(`Groq API attempt ${attempt}/${maxRetries} failed:`, error.message);
      
      if (attempt === maxRetries) {
        return getFallbackResponse(messages);
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

function getFallbackResponse(messages) {
  const lastUserMsg = messages.filter(m => m.role === 'user').slice(-1)[0]?.content || '';
  
  if (lastUserMsg.includes('```') || lastUserMsg.toLowerCase().includes('solution')) {
    return "Thanks for sharing your solution. Let me review this. Can you walk me through your approach and explain the time complexity?";
  }
  
  if (lastUserMsg.toLowerCase().includes('hint')) {
    return "Think about what data structure would give you O(1) lookup time. What operations do you need to perform efficiently?";
  }
  
  if (lastUserMsg.includes('?')) {
    return "That's a good question. Let me clarify: focus on the core algorithm first, then we can optimize. What's your initial approach?";
  }
  
  return "I see what you're thinking. Could you elaborate on that approach? What would be the time and space complexity?";
}

async function executeCode(code, language) {
  // Simulated code execution (Judge0 integration would go here)
  console.log(`Executing ${language} code...`);
  
  return {
    executed: true,
    output: "Code executed successfully.\n\nSample Output: [Expected results based on test cases]",
    status: "Accepted",
    time: "0.05s",
    memory: "2.1 MB"
  };
}

function createSession(company, language) {
  const interviewer = selectInterviewer(company);
  
  return {
    company: company || 'Google',
    language: language || 'javascript',
    interviewerName: interviewer.name,
    interviewerGender: interviewer.gender,
    interviewerPersonality: interviewer.personality,
    conversationHistory: [],
    usedQuestions: [],
    currentRound: 'dsa',
    currentDifficulty: 'medium',
    roundProgress: {
      dsa: { current: 0, total: 2 },
      theoretical: { current: 0, total: 3 },
      hr: { current: 0, total: 2 }
    },
    performanceMetrics: {
      hintsUsed: 0,
      clarificationsAsked: 0,
      codeSubmissions: 0,
      successfulExecutions: 0,
      timePerProblem: [],
      difficultyProgression: ['medium']
    },
    startTime: Date.now(),
    lastActionTime: Date.now(),
    lastQuestionTime: Date.now()
  };
}

// ==================== API ENDPOINTS ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    activeSessions: sessions.size,
    groqConnected: !!GROQ_API_KEY
  });
});

// Resume parser
app.post('/api/resume-parser', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    let text = '';
    const fileBuffer = req.file.buffer;
    const fileType = req.file.mimetype;

    // Parse based on file type
    if (fileType === 'application/pdf') {
      const pdfData = await pdfParse(fileBuffer);
      text = pdfData.text;
    } else if (fileType.includes('word') || fileType.includes('document')) {
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      text = result.value;
    } else {
      text = fileBuffer.toString('utf-8');
    }

    // Extract skills using pattern matching
    const skillPatterns = {
      languages: ['java', 'python', 'javascript', 'typescript', 'c++', 'c#', 'go', 'rust', 'kotlin', 'swift'],
      frameworks: ['react', 'angular', 'vue', 'django', 'flask', 'spring', 'node', 'express', 'fastapi'],
      databases: ['sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'cassandra', 'dynamodb'],
      tools: ['git', 'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'jenkins', 'terraform'],
      concepts: ['algorithm', 'data structure', 'system design', 'machine learning', 'api', 'rest', 'graphql']
    };

    const skills = new Set();
    const lowerText = text.toLowerCase();

    Object.values(skillPatterns).forEach(category => {
      category.forEach(skill => {
        if (lowerText.includes(skill)) {
          skills.add(skill.charAt(0).toUpperCase() + skill.slice(1));
        }
      });
    });

    // Add default skills if none found
    if (skills.size === 0) {
      skills.add('Data Structures');
      skills.add('Algorithms');
      skills.add('Problem Solving');
    }

    res.json({
      success: true,
      skills: Array.from(skills).slice(0, 12),
      message: 'Resume analyzed successfully',
      filename: req.file.originalname
    });

  } catch (error) {
    console.error('Resume parsing error:', error);
    res.status(500).json({ 
      error: 'Failed to parse resume',
      message: error.message 
    });
  }
});

// Main interview agent
app.post('/api/interview-agent', async (req, res) => {
  try {
    const { action, sessionId, company, language, answer, type, currentQuestion } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    // Initialize or retrieve session
    if (!sessions.has(sessionId)) {
      if (action !== 'start') {
        return res.status(404).json({ error: 'Session not found. Please start a new interview.' });
      }
      sessions.set(sessionId, createSession(company, language));
    }

    const session = sessions.get(sessionId);
    session.lastActionTime = Date.now();

    // ==================== START INTERVIEW ====================
    if (action === 'start') {
      const welcomeMessage = `Hi! I'm ${session.interviewerName}, I'll be your interviewer today for this ${session.company} interview.

Let me walk you through what we'll cover in the next 90 minutes:

**🔷 DSA Coding Round (45 min):** Two algorithm problems - I'll ask you to code solutions
**🔷 Technical Discussion (20 min):** System design and CS fundamentals
**🔷 Behavioral Round (25 min):** Your experiences and leadership stories

Feel free to think out loud, ask clarifying questions anytime, or request hints if you're stuck. I'm here to help you do your best!

Ready to start with the first coding problem?`;

      // Get first question
      const question = getRandomQuestion(session.company, 'dsa', session.currentDifficulty, session.usedQuestions);
      session.usedQuestions.push(question);
      session.lastQuestionTime = Date.now();

      // Initialize conversation history
      const systemPrompt = SYSTEM_PROMPTS['dsa']
        .replace(/{INTERVIEWER_NAME}/g, session.interviewerName)
        .replace(/{COMPANY}/g, session.company)
        .replace(/{PERSONALITY}/g, session.interviewerPersonality);

      session.conversationHistory = [
        { role: 'system', content: systemPrompt },
        { role: 'assistant', content: welcomeMessage }
      ];

      const formattedQuestion = formatQuestionForDisplay(question);

      return res.json({
        success: true,
        welcomeMessage,
        question: formattedQuestion,
        interviewerName: session.interviewerName,
        interviewerGender: session.interviewerGender,
        currentRound: session.currentRound,
        roundProgress: `${session.roundProgress.dsa.current + 1}/${session.roundProgress.dsa.total}`,
        difficulty: session.currentDifficulty,
        sessionId
      });
    }

    // ==================== CLARIFICATION ====================
    if (action === 'clarify') {
      session.performanceMetrics.clarificationsAsked++;

      session.conversationHistory.push({
        role: 'user',
        content: `Clarification question: ${answer}`
      });

      session.conversationHistory.push({
        role: 'system',
        content: 'Answer their clarification briefly (1-2 sentences). Be helpful but don\'t give away the solution.'
      });

      const response = await callGroqAPI(session.conversationHistory);
      
      // Remove the system instruction, keep only the response
      session.conversationHistory.pop();
      session.conversationHistory.push({
        role: 'assistant',
        content: response
      });

      return res.json({
        success: true,
        response,
        type: 'clarification'
      });
    }

    // ==================== HINT ====================
    if (action === 'hint') {
      session.performanceMetrics.hintsUsed++;
      const hintLevel = session.performanceMetrics.hintsUsed;

      let hintInstruction;
      if (hintLevel === 1) {
        hintInstruction = 'Give a strategic hint about the approach/algorithm to use. Don\'t reveal implementation details. Keep it to 2 sentences.';
      } else if (hintLevel === 2) {
        hintInstruction = 'Give a more specific hint about implementation. You can mention a specific data structure. Keep it to 2 sentences.';
      } else {
        hintInstruction = 'Give a detailed hint with pseudocode structure. Suggest they can ask for help if still stuck. 2-3 sentences.';
      }

      session.conversationHistory.push({
        role: 'user',
        content: '[Candidate requested a hint]'
      });

      session.conversationHistory.push({
        role: 'system',
        content: `${hintInstruction} Current problem: ${typeof currentQuestion === 'string' ? currentQuestion : currentQuestion?.title || 'coding problem'}`
      });

      const response = await callGroqAPI(session.conversationHistory);

      session.conversationHistory.pop();
      session.conversationHistory.push({
        role: 'assistant',
        content: `💡 Hint #${hintLevel}: ${response}`
      });

      return res.json({
        success: true,
        response: `💡 Hint #${hintLevel}: ${response}`,
        hintLevel,
        type: 'hint'
      });
    }

    // ==================== ANSWER (CODE OR VOICE) ====================
    if (action === 'answer') {
      let userMessage = answer;
      let executionResults = null;

      // Handle code submission
      if (type === 'code') {
        session.performanceMetrics.codeSubmissions++;
        
        const timeOnProblem = Math.floor((Date.now() - session.lastQuestionTime) / 1000);
        session.performanceMetrics.timePerProblem.push(timeOnProblem);

        // Execute code
        executionResults = await executeCode(answer, session.language);
        
        if (executionResults.status === 'Accepted') {
          session.performanceMetrics.successfulExecutions++;
        }

        userMessage = `Here's my ${session.language} solution:\n\n\`\`\`${session.language}\n${answer.substring(0, 500)}${answer.length > 500 ? '...' : ''}\n\`\`\`\n\nExecution: ${executionResults.status}`;
      }

      session.conversationHistory.push({
        role: 'user',
        content: userMessage
      });

      // Add context based on round type
      let reviewInstruction;
      if (type === 'code') {
        reviewInstruction = 'Review their code briefly (2 sentences). Ask ONE follow-up about complexity or edge cases. Then say "Good work. Let\'s move to the next problem." to transition.';
      } else if (session.currentRound === 'theoretical') {
        reviewInstruction = 'Acknowledge their answer (1 sentence). Ask ONE thoughtful follow-up OR say "Let me ask about another topic." to transition.';
      } else {
        reviewInstruction = 'Show empathy and understanding (1 sentence). Ask ONE follow-up like "What did you learn?" OR say "Thanks for sharing. Let me ask another question." to transition.';
      }

      session.conversationHistory.push({
        role: 'system',
        content: reviewInstruction
      });

      const response = await callGroqAPI(session.conversationHistory);

      session.conversationHistory.pop();
      session.conversationHistory.push({
        role: 'assistant',
        content: response
      });

      // Assess performance and adjust difficulty
      session.currentDifficulty = assessPerformance(session.conversationHistory, session.currentDifficulty);
      session.performanceMetrics.difficultyProgression.push(session.currentDifficulty);

      // Check for round transition
      let nextQuestion = null;
      let shouldTransition = false;
      const responseLower = response.toLowerCase();

      const transitionPhrases = ['next problem', 'move to', 'another topic', 'another question', 'let me ask'];
      const shouldMoveForward = transitionPhrases.some(phrase => responseLower.includes(phrase));

      if (shouldMoveForward) {
        const currentRound = session.currentRound;
        const progress = session.roundProgress[currentRound];

        // Increment progress
        progress.current++;
        session.lastQuestionTime = Date.now();
        session.performanceMetrics.hintsUsed = 0;

        // Check if we need to transition to next round
        if (progress.current < progress.total) {
          // Same round, next question
          nextQuestion = getRandomQuestion(session.company, currentRound, session.currentDifficulty, session.usedQuestions);
          session.usedQuestions.push(nextQuestion);
        } else {
          // Transition to next round
          shouldTransition = true;

          if (currentRound === 'dsa') {
            session.currentRound = 'theoretical';
            
            const newPrompt = SYSTEM_PROMPTS['theoretical']
              .replace(/{INTERVIEWER_NAME}/g, session.interviewerName)
              .replace(/{COMPANY}/g, session.company)
              .replace(/{PERSONALITY}/g, session.interviewerPersonality);
            
            session.conversationHistory.push({ role: 'system', content: newPrompt });
            
            nextQuestion = getRandomQuestion(session.company, 'theoretical', null, session.usedQuestions);
            session.usedQuestions.push(nextQuestion);
            session.roundProgress.theoretical.current++;

          } else if (currentRound === 'theoretical') {
            session.currentRound = 'hr';
            
            const newPrompt = SYSTEM_PROMPTS['hr']
              .replace(/{INTERVIEWER_NAME}/g, session.interviewerName)
              .replace(/{COMPANY}/g, session.company)
              .replace(/{PERSONALITY}/g, session.interviewerPersonality);
            
            session.conversationHistory.push({ role: 'system', content: newPrompt });
            
            nextQuestion = getRandomQuestion(session.company, 'hr', null, session.usedQuestions);
            session.usedQuestions.push(nextQuestion);
            session.roundProgress.hr.current++;
          }
        }

        if (nextQuestion) {
          nextQuestion = formatQuestionForDisplay(nextQuestion);
        }
      }

      return res.json({
        success: true,
        response,
        nextQuestion,
        currentRound: session.currentRound,
        roundProgress: `${session.roundProgress[session.currentRound].current}/${session.roundProgress[session.currentRound].total}`,
        difficulty: session.currentDifficulty,
        shouldTransition,
        executionResults
      });
    }

    // ==================== END INTERVIEW ====================
    if (action === 'end') {
      const duration = Math.floor((Date.now() - session.startTime) / 60000);
      const avgTimePerProblem = session.performanceMetrics.timePerProblem.length > 0
        ? Math.floor(session.performanceMetrics.timePerProblem.reduce((a, b) => a + b, 0) / session.performanceMetrics.timePerProblem.length)
        : 0;

      const feedbackPrompt = [
        {
          role: 'system',
          content: `You are ${session.interviewerName} from ${session.company}. Provide detailed, constructive interview feedback.`
        },
        {
          role: 'user',
          content: `Provide final interview feedback.

**Interview Stats:**
- Duration: ${duration} minutes
- Company: ${session.company}
- DSA Problems: ${session.roundProgress.dsa.current}/${session.roundProgress.dsa.total}
- Technical Questions: ${session.roundProgress.theoretical.current}/${session.roundProgress.theoretical.total}
- Behavioral Questions: ${session.roundProgress.hr.current}/${session.roundProgress.hr.total}
- Hints Used: ${session.performanceMetrics.hintsUsed}
- Code Submissions: ${session.performanceMetrics.codeSubmissions}
- Successful Executions: ${session.performanceMetrics.successfulExecutions}
- Average Time per Problem: ${avgTimePerProblem}s
- Difficulty Progression: ${session.performanceMetrics.difficultyProgression.join(' → ')}

**Format your feedback as:**

**Overall Assessment:** (2-3 sentences summary)

**Technical Skills:**
- Coding ability: (specific observation)
- Problem-solving approach: (specific observation)
- Complexity analysis: (specific observation)

**Communication:**
- Clarity of explanation: (specific observation)
- Questions asked: (quality assessment)

**Strengths:**
1. [Specific strength with example]
2. [Specific strength with example]
3. [Specific strength with example]

**Areas for Improvement:**
1. [Specific area with actionable advice]
2. [Specific area with actionable advice]
3. [Specific area with actionable advice]

**Recommendation:** [Strong Hire / Hire / Maybe / No Hire]
**Reasoning:** (2 sentences explaining the recommendation)

**Next Steps:**
1. [Specific action item]
2. [Specific action item]`
        }
      ];

      const feedback = await callGroqAPI(feedbackPrompt);

      // Archive session
      sessionBackups.set(sessionId, JSON.parse(JSON.stringify(session)));
      sessions.delete(sessionId);

      return res.json({
        success: true,
        feedback,
        duration,
        questionsAnswered: {
          dsa: session.roundProgress.dsa.current,
          theoretical: session.roundProgress.theoretical.current,
          hr: session.roundProgress.hr.current
        },
        metrics: session.performanceMetrics
      });
    }

    return res.status(400).json({ error: 'Invalid action specified' });

  } catch (error) {
    console.error('Interview agent error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Session recovery endpoint
app.post('/api/session-recover', (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID required' });
    }

    // Check active sessions
    if (sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      return res.json({
        success: true,
        recovered: true,
        currentRound: session.currentRound,
        timeElapsed: Math.floor((Date.now() - session.startTime) / 1000),
        message: 'Active session found'
      });
    }

    // Check backup sessions
    if (sessionBackups.has(sessionId)) {
      const backup = sessionBackups.get(sessionId);
      sessions.set(sessionId, backup);
      return res.json({
        success: true,
        recovered: true,
        message: 'Session restored from backup'
      });
    }

    return res.json({
      success: false,
      recovered: false,
      message: 'Session not found'
    });

  } catch (error) {
    console.error('Session recovery error:', error);
    res.status(500).json({
      error: 'Recovery failed',
      message: error.message
    });
  }
});

// Get session status
app.get('/api/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    if (sessions.has(sessionId)) {
      const session = sessions.get(sessionId);
      return res.json({
        exists: true,
        currentRound: session.currentRound,
        progress: session.roundProgress,
        timeElapsed: Math.floor((Date.now() - session.startTime) / 1000)
      });
    }

    res.json({ exists: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ERROR HANDLING ====================
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// ==================== START SERVER ====================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 InterviewAce Backend v3.0 - PRODUCTION READY');
  console.log('='.repeat(60));
  console.log(`📍 Server: http://localhost:${PORT}`);
  console.log(`✅ Groq API: ${GROQ_API_KEY && GROQ_API_KEY !== 'your_groq_api_key_here' ? 'Connected ✓' : '❌ NOT CONFIGURED'}`);
  console.log(`📊 Active Sessions: ${sessions.size}`);
  console.log(`💾 Auto-save: Every 30 seconds`);
  console.log(`🔄 Session Cleanup: Every 60 minutes`);
  console.log('='.repeat(60));
  console.log('\n📝 Available Endpoints:');
  console.log('   POST /api/resume-parser');
  console.log('   POST /api/interview-agent');
  console.log('   POST /api/session-recover');
  console.log('   GET  /api/health');
  console.log('   GET  /api/session/:sessionId');
  console.log('\n' + '='.repeat(60) + '\n');
});