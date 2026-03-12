import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useCreateAlert } from '@workspace/api-client-react';
import { useChartStore } from '../../store/use-chart-store';
import { ASSETS } from '../../lib/deriv-constants';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { getListAlertsQueryKey } from '@workspace/api-client-react';

const formSchema = z.object({
  symbol: z.string().min(1, 'Symbol is required'),
  price: z.coerce.number().positive('Price must be positive'),
  condition: z.enum(['above', 'below']),
});

interface CreateAlertDialogProps {
  onSuccess: () => void;
}

export default function CreateAlertDialog({ onSuccess }: CreateAlertDialogProps) {
  const currentSymbol = useChartStore(s => s.symbol);
  const livePrice = useChartStore(s => s.livePrice);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      symbol: currentSymbol,
      price: livePrice || 0,
      condition: 'above',
    },
  });

  const createMutation = useCreateAlert({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Alert Created', description: 'Your price alert is now active.' });
        queryClient.invalidateQueries({ queryKey: getListAlertsQueryKey() });
        onSuccess();
      },
      onError: () => {
        toast({ title: 'Error', description: 'Failed to create alert.', variant: 'destructive' });
      }
    }
  });

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    // Request notification permission if not granted
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
    
    createMutation.mutate({ data: values });
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
        <FormField
          control={form.control}
          name="symbol"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Asset</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select an asset" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {ASSETS.map(a => (
                    <SelectItem key={a.symbol} value={a.symbol}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="condition"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Condition</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Crossing" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="above">Crossing Up (Above)</SelectItem>
                    <SelectItem value="below">Crossing Down (Below)</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="price"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Price Level</FormLabel>
                <FormControl>
                  <Input type="number" step="any" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="pt-4 flex justify-end">
          <Button 
            type="submit" 
            disabled={createMutation.isPending}
            className="w-full bg-gradient-to-r from-primary to-primary/80 hover:shadow-lg hover:shadow-primary/25 transition-all"
          >
            {createMutation.isPending ? 'Creating...' : 'Create Alert'}
          </Button>
        </div>
      </form>
    </Form>
  );
}
