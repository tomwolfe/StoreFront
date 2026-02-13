import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { stores, products, stock } from '@/lib/db/schema';
import { eq, and, gt, sql, desc, like, ilike } from 'drizzle-orm';
import { z } from 'zod';
import { TOOL_METADATA } from '@/lib/mcp';

const findProductSchema = z.object({
  product_query: z.string(),
  user_lat: z.number(),
  user_lng: z.number(),
  max_radius_miles: z.number().default(10)
});

const reserveStockSchema = z.object({
  product_id: z.string(),
  store_id: z.string(),
  quantity: z.number().int().positive()
});

export async function GET() {
  return NextResponse.json(TOOL_METADATA);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tool, params } = body;

    if (tool === 'find_product_nearby') {
      const { product_query, user_lat, user_lng, max_radius_miles } = findProductSchema.parse(params);

      // Haversine formula for distance in miles
      // 3959 * acos( cos( radians(user_lat) ) * cos( radians( latitude ) ) * cos( radians( longitude ) - radians(user_lng) ) + sin( radians(user_lat) ) * sin( radians( latitude ) ) )
      
      const distance = sql`
        (3959 * acos(
          cos(radians(${user_lat})) * 
          cos(radians(${stores.latitude})) * 
          cos(radians(${stores.longitude}) - radians(${user_lng})) + 
          sin(radians(${user_lat})) * 
          sin(radians(${stores.latitude}))
        ))
      `;

      const results = await db
        .select({
          store: stores,
          product: products,
          stock: stock,
          distance: distance
        })
        .from(stock)
        .innerJoin(stores, eq(stock.storeId, stores.id))
        .innerJoin(products, eq(stock.productId, products.id))
        .where(
          and(
            ilike(products.name, `%${product_query}%`),
            gt(stock.availableQuantity, 0),
            sql`${distance} < ${max_radius_miles}`
          )
        )
        .orderBy(distance) // Order by distance closest first
        .limit(10);

      const mappedResults = results.map(({ store, product, stock, distance }) => ({
        store_id: store.id,
        venue_id: store.id, // IntentionEngine mapping
        store_name: store.name,
        product_name: product.name,
        price: product.price,
        available_quantity: stock.availableQuantity,
        distance_miles: Number(distance).toFixed(2),
        formatted_pickup_address: store.fullAddress // Ready for OpenDeliver
      }));

      if (mappedResults.length === 0) {
         // Return gracefully so LLM can handle it
         return NextResponse.json({ 
           content: [{ type: 'text', text: `No stores found with "${product_query}" in stock within ${max_radius_miles} miles.` }] 
         });
      }

      return NextResponse.json({ content: [{ type: 'text', text: JSON.stringify(mappedResults, null, 2) }] });
    }

    if (tool === 'reserve_stock_item') {
      const { product_id, store_id, quantity } = reserveStockSchema.parse(params);

      try {
        await db.transaction(async (tx) => {
          // Check current stock
          const currentStock = await tx
            .select()
            .from(stock)
            .where(
              and(
                eq(stock.storeId, store_id),
                eq(stock.productId, product_id)
              )
            );

          if (currentStock.length === 0) {
            throw new Error('Stock record not found');
          }

          if (currentStock[0].availableQuantity < quantity) {
            throw new Error(`Insufficient stock. Available: ${currentStock[0].availableQuantity}, Requested: ${quantity}`);
          }

          // Decrement stock
          await tx
            .update(stock)
            .set({ 
              availableQuantity: currentStock[0].availableQuantity - quantity,
              updatedAt: new Date()
            })
            .where(
              and(
                eq(stock.storeId, store_id),
                eq(stock.productId, product_id)
              )
            );
        });

        return NextResponse.json({ 
          content: [{ type: 'text', text: `Successfully reserved ${quantity} items of product ${product_id} at store ${store_id}.` }] 
        });

      } catch (error: any) {
        return NextResponse.json({ 
          content: [{ type: 'text', text: `Reservation failed: ${error.message}` }],
          isError: true
        });
      }
    }

    return NextResponse.json({ error: 'Unknown tool' }, { status: 400 });

  } catch (error: any) {
    console.error('MCP Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
