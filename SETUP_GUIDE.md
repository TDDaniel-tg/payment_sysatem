# Payment System Setup Guide

This guide explains how to set up the payment system as a separate Git repository and deploy it to Railway.

## Step 1: Create a New Git Repository

1. Create a new repository on GitHub or another Git hosting service
2. Initialize the repository locally:

```bash
cd payment_system
git init
git add .
git commit -m "Initial commit"
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

## Step 2: Deploy to Railway

1. Go to [Railway](https://railway.app/)
2. Click "New Project" → "Deploy from GitHub"
3. Select your payment system repository
4. Railway will automatically detect the Dockerfile and build the project
5. After deployment, go to Settings and add the following environment variables:
   - `SHOP_ID`: Your ЮKassa shop ID
   - `SECRET_KEY`: Your ЮKassa secret key
   
## Step 3: Configure Webhook URL

After deploying to Railway, you'll get a public URL for your payment system. You need to use this URL in two places:

1. In the Optimizator Bot environment variables:
   ```
   PAYMENT_SERVER_URL=https://your-payment-server-url.railway.app
   ```

2. In the ЮKassa Admin Panel:
   - Log in to your ЮKassa merchant account
   - Go to Settings → API → Webhooks
   - Add a new webhook with the URL:
     ```
     https://your-payment-server-url.railway.app/api/webhook
     ```

## Step 4: Update Mini App URL

1. In your Telegram Bot Father:
   - Send /mybots
   - Select your OptimizatorBot
   - Go to Bot Settings → Menu Button → Configure menu button
   - Set the Web App URL to:
     ```
     https://your-payment-server-url.railway.app
     ```

## Step 5: Test the Integration

1. In your Telegram bot, use the /subscription command to test the WebApp button
2. Try completing the payment flow to ensure everything works
3. Check Railway logs for any errors

## Updating the Code

When you need to update the payment system:

1. Make changes to the code
2. Commit and push to your Git repository
3. Railway will automatically redeploy the application

## Troubleshooting

If you encounter issues:

1. Check Railway logs for errors
2. Verify environment variables are set correctly
3. Make sure webhooks are configured properly in ЮKassa
4. Test WebApp URL directly in a browser 