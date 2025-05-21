// Простой серверный скрипт для интеграции с ЮKassa
// Для запуска: node server.js
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Настройка CORS для запросов с фронтенда
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

// Для хранения заказов (в реальном приложении используйте базу данных)
const orders = {};

// Инициализация ЮKassa
// ВНИМАНИЕ: В реальном приложении эти данные должны храниться в безопасном месте (env переменные)
// Используем тестовые данные (специальные ID и ключ тестового магазина из личного кабинета)
const shopId = '1086529'; // ID тестового магазина из личного кабинета ЮKassa
const secretKey = 'test_fItob0t2XOZPQETIa7npqoKf5PsxbXlrMTHV88P4WZA'; // Тестовый секретный ключ из личного кабинета тестового магазина

// Для боевого режима замените на данные вашего магазина:
// const shopId = '1053058'; // Ваш идентификатор магазина ЮKassa
//const secretKey = 'live_Zf5IzprxpE7PWU-PGJQ7GRzLRo39oL4Wg2__QMKWZt4'; // ВАЖНО: Замените на ваш секретный ключ из личного кабинета ЮKassa


let yooKassa = null;

// Режим работы (true - тестовый, false - боевой)
const isTestMode = true;

// Инициализация клиента ЮKassa
try {
    const YooKassa = require('yookassa');
    yooKassa = new YooKassa({
        shopId: shopId,
        secretKey: secretKey
    });
    console.log('ЮKassa клиент инициализирован в', isTestMode ? 'тестовом' : 'боевом', 'режиме');
} catch (error) {
    console.error('Ошибка инициализации ЮKassa:', error);
    console.error('Установите библиотеку командой: npm install yookassa --save');
}

// Маршрут для обслуживания HTML
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Маршрут для создания платежа в ЮKassa
app.post('/api/create-payment', async (req, res) => {
    console.log('Получен запрос на создание платежа:', req.body);
    
    try {
        const { amount, description, userId, planName, email } = req.body;

        // Создаем безопасный fallback для userId, если он не передан
        const safeUserId = userId || `anonymous_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        
        // Проверяем email для чека
        const safeEmail = email && email.includes('@') ? email : 'customer@example.com';

        if (!amount) {
            console.error('Не указана сумма платежа:', req.body);
            return res.status(400).json({ error: 'Не указана сумма платежа' });
        }

        // Проверка доступности YooKassa API
        if (!yooKassa) {
            console.error('YooKassa API не инициализирован');
            return res.status(500).json({ error: 'Сервис оплаты недоступен', details: 'API не инициализирован' });
        }

        try {
            // Создаем заказ в ЮKassa
            let idempotenceKey = crypto.randomUUID ? 
                crypto.randomUUID() : 
                Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            
            console.log('Создаем платеж в ЮKassa с параметрами:', {
                amount, description, idempotenceKey, safeUserId, isTestMode, email: safeEmail
            });
            
            // Настраиваем параметры платежа
            const paymentParams = {
                amount: {
                    value: amount,
                    currency: 'RUB'
                },
                capture: true, // Автоматически принимать поступившие средства
                description: description || `Подписка ${planName || 'на бота'}`,
                metadata: {
                    userId: safeUserId,
                    planName: planName || 'Стандарт'
                }
            };

            // Добавляем параметр confirmation в зависимости от режима
            if (isTestMode) {
                // В тестовом режиме используем redirect для надежности
                paymentParams.confirmation = {
                    type: 'redirect',
                    return_url: `${req.protocol}://${req.get('host')}?success=true`
                };
            } else {
                // В боевом режиме используем embedded
                paymentParams.confirmation = {
                    type: 'embedded',
                    locale: 'ru_RU'
                };
                
                // Добавляем данные для чека (требуется по 54-ФЗ)
                paymentParams.receipt = {
                    customer: {
                        email: safeEmail // Используем email от пользователя
                    },
                    items: [
                        {
                            description: `Подписка "${planName || 'Стандарт'}"`,
                            amount: {
                                value: amount,
                                currency: "RUB"
                            },
                            vat_code: 1, // НДС 20%
                            quantity: 1,
                            payment_subject: "service",
                            payment_mode: "full_payment"
                        }
                    ]
                };
            }
            
            // Создаем платеж
            const payment = await yooKassa.createPayment(paymentParams, idempotenceKey);
            
            // Сохраняем информацию о заказе
            orders[payment.id] = {
                status: payment.status,
                userId: safeUserId,
                amount: amount,
                planName: planName || 'Стандарт',
                createdAt: new Date(),
                email: safeEmail
            };
            
            console.log('Платеж успешно создан:', payment.id);
            console.log('Данные для оплаты:', payment.confirmation);
            
            // Подготавливаем ответ клиенту
            const response = {
                orderId: payment.id,
                status: payment.status,
                amount: amount,
                testMode: isTestMode
            };

            // Добавляем конфирмацию в зависимости от типа
            if (isTestMode) {
                response.redirectUrl = payment.confirmation.confirmation_url;
            } else {
                response.confirmationToken = payment.confirmation.confirmation_token;
            }
            
            // Отправляем клиенту информацию о платеже
            return res.json(response);
        } catch (yooKassaError) {
            console.error('Ошибка при создании платежа в ЮKassa:', yooKassaError);
            
            // Логируем детальную информацию об ошибке
            console.error('Детали ошибки YooKassa:', 
                JSON.stringify(yooKassaError.response || yooKassaError.message || yooKassaError));
            
            // Проверяем специфические ошибки YooKassa
            const errorMessage = yooKassaError.response?.description || 
                                yooKassaError.message || 
                                'Ошибка сервиса оплаты';
            
            // Если это ошибка авторизации, возвращаем более точное сообщение
            if (errorMessage.includes('authentication') || 
                errorMessage.includes('auth') || 
                errorMessage.includes('unauthorized') ||
                yooKassaError.response?.code === 401) {
                return res.status(500).json({ 
                    error: 'Ошибка авторизации в платежной системе', 
                    details: errorMessage
                });
            }
            
            // Если это проблема с магазином, возвращаем соответствующее сообщение
            if (errorMessage.includes('shop') || errorMessage.includes('account')) {
                return res.status(500).json({ 
                    error: 'Проблема с настройками магазина в платежной системе', 
                    details: errorMessage
                });
            }
            
            // Если это проблема с чеком, возвращаем сообщение о неверных данных для чека
            if (errorMessage.includes('receipt') || errorMessage.includes('tax')) {
                return res.status(500).json({ 
                    error: 'Ошибка в данных для чека', 
                    details: errorMessage
                });
            }
            
            // Если другая ошибка, пробуем тестовый режим как запасной вариант
            console.log('Переключаемся на тестовый режим из-за ошибки...');
            return createTestPayment(amount, description, safeUserId, planName, res);
        }
    } catch (error) {
        console.error('Ошибка при создании платежа:', error);
        res.status(500).json({ error: 'Не удалось создать платеж', details: error.message });
    }
});

// Функция для создания тестового платежа
function createTestPayment(amount, description, userId, planName, res) {
    // Генерируем уникальный ID заказа
    let orderId;
    try {
        orderId = 'order_' + crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    } catch (e) {
        orderId = 'order_' + Math.random().toString(36).substring(2, 15) + 
                        Math.random().toString(36).substring(2, 15);
    }
    
    console.log('Создаем тестовый платеж с параметрами:', {
        orderId, amount, description, userId
    });
    
    // Создаем фейковый токен для тестирования
    const fakeToken = Buffer.from(JSON.stringify({
        orderId: orderId,
        amount: amount,
        desc: description,
        time: Date.now()
    })).toString('base64');
    
    // Сохраняем информацию о заказе
    orders[orderId] = {
        status: 'pending',
        userId: userId,
        amount: amount,
        planName: planName || 'Стандарт',
        createdAt: new Date()
    };
    
    console.log('Тестовый платеж создан:', orderId);
    
    // Отправляем клиенту информацию о платеже
    return res.json({
        orderId: orderId,
        status: 'pending',
        confirmationToken: fakeToken,
        amount: amount,
        testMode: true // Флаг для фронтенда, что мы в тестовом режиме
    });
}

// Маршрут для имитации оплаты (для тестового режима)
app.post('/api/test-payment', async (req, res) => {
    const { orderId } = req.body;
    
    if (!orderId || !orders[orderId]) {
        return res.status(400).json({ error: 'Неверный ID заказа' });
    }
    
    console.log(`Имитация успешной оплаты для заказа ${orderId}`);
    
    // Обновляем статус заказа
    orders[orderId].status = 'succeeded';
    
    res.json({
        orderId: orderId,
        status: 'succeeded',
        message: 'Тестовая оплата успешно выполнена'
    });
});

// Маршрут для webhook от ЮKassa
app.post('/api/webhook', async (req, res) => {
    // Ключ из уведомления
    const requestBody = req.body;
    
    try {
        console.log('Получено webhook-уведомление:', JSON.stringify(requestBody));
        
        const event = requestBody.event;
        const paymentId = requestBody.object?.id;
        
        if (!event || !paymentId) {
            console.error('Некорректные данные в webhook-уведомлении');
            return res.status(400).json({ error: 'Некорректные данные' });
        }
        
        console.log(`Получено уведомление: ${event} для платежа ${paymentId}`);
        
        // Проверка аутентичности уведомления (в реальном приложении добавьте проверку подписи)
        // См. документацию: https://yookassa.ru/developers/using-api/webhooks
        
        if (event === 'payment.succeeded') {
            // Платеж успешно завершен
            if (orders[paymentId]) {
                orders[paymentId].status = 'succeeded';
                
                // В реальном приложении здесь нужно обновить информацию в базе данных
                // И отправить уведомление пользователю через бота
                console.log(`Платеж ${paymentId} успешно завершен`);
            } else {
                console.log(`Платеж ${paymentId} не найден в локальной базе, но успешно завершен`);
                // Создаем запись, если ее нет
                orders[paymentId] = {
                    status: 'succeeded',
                    createdAt: new Date()
                };
            }
        } else if (event === 'payment.canceled') {
            // Платеж отменен
            if (orders[paymentId]) {
                orders[paymentId].status = 'canceled';
                console.log(`Платеж ${paymentId} отменен`);
            } else {
                console.log(`Платеж ${paymentId} не найден в локальной базе, но отменен`);
            }
        }
        
        // Отвечаем сервису ЮKassa, что уведомление обработано
        res.sendStatus(200);
    } catch (error) {
        console.error('Ошибка при обработке webhook:', error);
        res.status(500).json({ error: 'Ошибка при обработке webhook' });
    }
});

// Маршрут для проверки статуса платежа
app.get('/api/payment-status/:orderId', async (req, res) => {
    const { orderId } = req.params;
    console.log(`Проверка статуса платежа: ${orderId}`);
    
    // Если у нас есть YooKassa и orderId не из тестового режима
    if (yooKassa && !orderId.startsWith('order_')) {
        try {
            // Получаем информацию о платеже из API ЮKassa
            const payment = await yooKassa.getPaymentInfo(orderId);
            
            // Обновляем статус в нашей локальной "базе данных"
            if (orders[orderId]) {
                orders[orderId].status = payment.status;
            } else {
                orders[orderId] = {
                    status: payment.status,
                    amount: payment.amount.value,
                    createdAt: new Date()
                };
            }
            
            console.log(`Получен статус платежа ${orderId} из ЮKassa: ${payment.status}`);
            
            return res.json({
                orderId: payment.id,
                status: payment.status,
                realStatus: true
            });
        } catch (error) {
            console.error('Ошибка при получении информации о платеже из ЮKassa:', error);
            
            // Если не удалось получить статус из ЮKassa, проверяем локальный статус
            if (orders[orderId]) {
                return res.json({
                    orderId: orderId,
                    status: orders[orderId].status,
                    realStatus: false
                });
            } else {
                return res.status(404).json({ error: 'Заказ не найден' });
            }
        }
    }
    
    // Проверяем статус в нашей локальной "базе данных" (для тестового режима)
    if (orders[orderId]) {
        console.log(`Получен статус платежа ${orderId} из локальной БД: ${orders[orderId].status}`);
        
        return res.json({
            orderId: orderId,
            status: orders[orderId].status,
            realStatus: false
        });
    } else {
        console.log(`Заказ ${orderId} не найден`);
        return res.status(404).json({ error: 'Заказ не найден' });
    }
});

// Маршрут для отладки - сброс хранилища заказов
app.get('/api/debug/reset-orders', (req, res) => {
    console.log('Сброс хранилища заказов');
    Object.keys(orders).forEach(key => delete orders[key]);
    res.json({ message: 'Хранилище заказов очищено', ordersCount: Object.keys(orders).length });
});

// Маршрут для получения всех заказов (только для отладки!)
app.get('/api/debug/orders', (req, res) => {
    console.log('Запрос всех заказов (debug)');
    res.json({ orders: orders, count: Object.keys(orders).length });
});

// Маршрут для активации подписки после успешной оплаты
app.post('/api/activate-subscription', async (req, res) => {
    const { userId, orderId, planName, planDuration } = req.body;
    
    console.log(`Запрос на активацию подписки для пользователя ${userId}, план: ${planName}, срок: ${planDuration} дней`);
    
    if (!userId) {
        return res.status(400).json({ error: 'Не указан ID пользователя' });
    }
    
    if (!orderId) {
        return res.status(400).json({ error: 'Не указан ID заказа' });
    }
    
    try {
        // Проверяем статус платежа
        let paymentStatus = 'unknown';
        
        // Проверяем в нашей локальной базе сначала
        if (orders[orderId]) {
            paymentStatus = orders[orderId].status;
        }
        
        // Если платеж не в статусе "succeeded", то проверяем через API ЮКасса
        if (paymentStatus !== 'succeeded' && yooKassa && !orderId.startsWith('order_')) {
            try {
                const payment = await yooKassa.getPaymentInfo(orderId);
                paymentStatus = payment.status;
                
                // Обновляем статус в нашей базе
                if (orders[orderId]) {
                    orders[orderId].status = paymentStatus;
                }
            } catch (error) {
                console.error(`Ошибка при проверке статуса платежа ${orderId} в ЮКасса:`, error);
            }
        }
        
        // Если платеж успешен или это тестовый режим, активируем подписку
        if (paymentStatus === 'succeeded' || orderId.startsWith('order_') || isTestMode) {
            // Формируем URL для запроса к Боту
            const botApiUrl = process.env.BOT_API_URL || 'http://localhost:5000';
            const activationEndpoint = `${botApiUrl}/add_subscription`;
            
            // Отправляем данные в API Бота для активации подписки
            try {
                const activationResponse = await fetch(activationEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        user_id: userId,
                        plan_name: planName,
                        duration_days: planDuration || 30,
                        payment_id: orderId
                    })
                });
                
                if (!activationResponse.ok) {
                    const error = await activationResponse.text();
                    console.error(`Ошибка активации подписки в боте: ${error}`);
                    throw new Error(`Ошибка активации подписки в боте: ${error}`);
                }
                
                const activationData = await activationResponse.json();
                console.log(`Подписка успешно активирована для пользователя ${userId}:`, activationData);
                
                // Добавляем информацию о подписке в заказ
                if (orders[orderId]) {
                    orders[orderId].subscriptionActivated = true;
                    orders[orderId].subscriptionPlan = planName;
                    orders[orderId].subscriptionExpiry = activationData.expires_at;
                }
                
                return res.json({
                    success: true,
                    message: 'Подписка успешно активирована',
                    subscription: activationData
                });
            } catch (activationError) {
                console.error('Ошибка при активации подписки:', activationError);
                
                // Даже если была ошибка, мы все равно считаем платеж успешным для клиента
                return res.json({
                    success: true,
                    message: 'Платеж успешен, но есть проблемы с активацией подписки. Мы активируем её вручную в ближайшее время.',
                    error: activationError.message
                });
            }
        } else {
            return res.status(400).json({
                success: false,
                message: 'Невозможно активировать подписку, платеж не завершен',
                status: paymentStatus
            });
        }
    } catch (error) {
        console.error('Ошибка при активации подписки:', error);
        return res.status(500).json({
            success: false,
            message: 'Ошибка при активации подписки',
            error: error.message
        });
    }
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`Сервер запущен на порту ${PORT}`);
    console.log(`Откройте http://localhost:${PORT} в браузере`);
    console.log(`Режим работы YooKassa: ${isTestMode ? 'ТЕСТОВЫЙ' : 'БОЕВОЙ'}`);
}); 